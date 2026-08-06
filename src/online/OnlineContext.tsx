import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ApiError,
  bootstrapHousehold as bootstrapHouseholdRequest,
  claimHouseholdDevice as claimHouseholdDeviceRequest,
  getHouseholdConfig,
  getMe,
  loginAdult as loginAdultRequest,
  loginChild as loginChildRequest,
  loginChildWithPairing as loginChildWithPairingRequest,
  logoutOnline,
  pullSyncState,
  pushSyncMutations,
  registerAdult as registerAdultRequest,
  type AuthSession,
  type BootstrapResult,
  type BootstrapSnapshot,
  type HouseholdRole,
  type OnlineUser,
  type PendingMutation,
  type ServerHouseholdConfig,
  type ServerSyncState,
  type SyncMutationType,
} from './api';
import { applyMutationResults, sendableMutations } from './syncQueue';
import {
  clearNativeCredentials, credentialsForPublicStorage, credentialsToRestore,
  loadNativeCredentials, saveNativeCredentials, usesNativeCredentialStorage,
} from './credentialStorage';
import type { Fighter } from '../game/types';
import { clearSyncEventCache, loadSyncEventCache, mergeSyncEvents, saveSyncEventCache, syncCursors } from './syncCache';
import { clearAvatarCache, knownAvatarHashes, loadAvatarCache, mergeAvatarCache, saveAvatarCache } from './avatarCache';
import { clearConfigurationCache, loadConfigurationCache, mergeConfigurationCache, saveConfigurationCache } from './configurationCache';

const STORAGE_KEY = 'boss-kamp-online-state-v2';
const MUTATIONS_KEY = 'boss-kamp-pending-mutations-v1';

export type OnlineMode = 'local' | 'adult-account' | 'household-device' | 'fighter-account';
export type OnlineStatus = 'idle' | 'restoring' | 'authenticated' | 'syncing' | 'offline' | 'error';
export type OnlineError = 'invalid-credentials' | 'account-exists' | 'session-ended' | 'network' | 'server' | 'invalid-request' | 'unknown';

export interface OnlineState {
  mode: OnlineMode;
  status: OnlineStatus;
  sessionToken: string | null;
  householdDeviceToken: string | null;
  sessionExpiresAt: string | null;
  userId: string | null;
  deviceId: string | null;
  householdId: string | null;
  fighterId: string | null;
  role: HouseholdRole | null;
  account: OnlineUser | null;
  householdName: string | null;
  lastSyncCursor: string | number | null;
  lastSuccessfulSyncAt: string | null;
  pendingMutationCount: number;
  rejectedMutationCount: number;
  configurationRevision: number;
  configurationConnectedAt: string | null;
  entityMappings: BootstrapResult['ids'] | null;
  error: OnlineError | null;
}

interface PersistedOnlineState {
  version: 2;
  mode: Exclude<OnlineMode, 'local'>;
  sessionToken: string | null;
  householdDeviceToken: string | null;
  sessionExpiresAt: string | null;
  userId: string | null;
  deviceId: string | null;
  householdId: string | null;
  fighterId: string | null;
  role: HouseholdRole | null;
  account: OnlineUser | null;
  householdName: string | null;
  lastSyncCursor: string | number | null;
  lastSuccessfulSyncAt: string | null;
  configurationRevision: number;
  configurationConnectedAt: string | null;
  entityMappings: BootstrapResult['ids'] | null;
}

interface OnlineActions {
  registerAdult(email: string, password: string, displayName: string): Promise<void>;
  loginAdult(email: string, password: string): Promise<void>;
  loginChild(householdId: string, fighterId: string, pin: string, deviceName: string, platform: string): Promise<void>;
  loginChildWithPairing(code: string, pin: string, deviceName: string, platform: string): Promise<void>;
  pairHouseholdDevice(code: string, deviceName: string, platform: string): Promise<void>;
  logout(): Promise<void>;
  forgetHousehold(householdId: string): void;
  createHousehold(name: string, snapshot: BootstrapSnapshot): Promise<ServerHouseholdConfig>;
  getConfiguration(): Promise<ServerHouseholdConfig>;
  enqueueMutation(type: SyncMutationType, payload: Record<string, unknown>): string;
  flushMutations(): Promise<ServerSyncState | null>;
  refreshIdentity(): Promise<void>;
  syncNow(): Promise<ServerSyncState | null>;
}

interface OnlineContextValue {
  state: OnlineState;
  actions: OnlineActions;
}

const localState: OnlineState = {
  mode: 'local', status: 'idle', sessionToken: null, householdDeviceToken: null, sessionExpiresAt: null,
  userId: null, deviceId: null, householdId: null, fighterId: null, role: null,
  account: null, householdName: null, lastSyncCursor: null,
  lastSuccessfulSyncAt: null, pendingMutationCount: 0, rejectedMutationCount: 0, configurationRevision: 0,
  configurationConnectedAt: null, entityMappings: null, error: null,
};

function clearPersistedState() {
  localStorage.removeItem(STORAGE_KEY);
  // Remove the short-lived key used by PR #18 after its data has been superseded.
  localStorage.removeItem('boss-kamp-online-session-v1');
}

function persistCredentials(state: OnlineState) {
  if (!usesNativeCredentialStorage()) return;
  void saveNativeCredentials({
    sessionToken: state.sessionToken,
    householdDeviceToken: state.householdDeviceToken,
  }).catch((error) => console.warn('Could not persist native credentials', error));
}

function loadPendingMutations(): PendingMutation[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(MUTATIONS_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PendingMutation => Boolean(
      item && typeof item === 'object'
      && typeof (item as PendingMutation).id === 'string'
      && typeof (item as PendingMutation).householdId === 'string'
      && typeof (item as PendingMutation).type === 'string'
      && (item as PendingMutation).payload && typeof (item as PendingMutation).payload === 'object',
    ));
  } catch {
    return [];
  }
}

function persistPendingMutations(mutations: PendingMutation[]) {
  localStorage.setItem(MUTATIONS_KEY, JSON.stringify(mutations));
}

function isOnlineUser(value: unknown): value is OnlineUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Partial<OnlineUser>;
  return typeof user.id === 'string'
    && typeof user.displayName === 'string'
    && (user.email === null || typeof user.email === 'string')
    && (user.kind === 'adult' || user.kind === 'child');
}

function loadPersistedState(): OnlineState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacyRaw = localStorage.getItem('boss-kamp-online-session-v1');
      if (!legacyRaw) return localState;
      const legacy = JSON.parse(legacyRaw) as {
        token?: unknown;
        expiresAt?: unknown;
        householdId?: unknown;
        user?: { id?: unknown; email?: unknown; displayName?: unknown; kind?: unknown };
      };
      const expiresAt = typeof legacy.expiresAt === 'string' ? Date.parse(legacy.expiresAt) : Number.NaN;
      if (
        typeof legacy.token !== 'string'
        || typeof legacy.user?.id !== 'string'
        || typeof legacy.user.displayName !== 'string'
        || !Number.isFinite(expiresAt)
        || expiresAt <= Date.now()
      ) {
        clearPersistedState();
        return localState;
      }
      const legacyUser: OnlineUser = {
        id: legacy.user.id,
        email: typeof legacy.user.email === 'string' ? legacy.user.email : null,
        displayName: legacy.user.displayName,
        kind: legacy.user.kind === 'child' ? 'child' : 'adult',
        emailVerified: false,
      };
      const migrated: OnlineState = {
        ...localState,
        mode: legacyUser.kind === 'child' ? 'fighter-account' : 'adult-account',
        status: 'restoring',
        sessionToken: legacy.token,
        sessionExpiresAt: legacy.expiresAt as string,
        userId: legacyUser.id,
        householdId: typeof legacy.householdId === 'string' ? legacy.householdId : null,
        account: legacyUser,
      };
      persistState(migrated);
      return migrated;
    }
    const value = JSON.parse(raw) as Partial<PersistedOnlineState>;
    const householdDevice = value.mode === 'household-device';
    const nativeCredentials = usesNativeCredentialStorage();
    const expiresAt = typeof value.sessionExpiresAt === 'string' ? Date.parse(value.sessionExpiresAt) : Number.NaN;
    if (
      value.version !== 2
      || (householdDevice
        ? (!nativeCredentials && typeof value.householdDeviceToken !== 'string') || typeof value.deviceId !== 'string' || typeof value.householdId !== 'string'
        : (!nativeCredentials && typeof value.sessionToken !== 'string') || typeof value.userId !== 'string' || !isOnlineUser(value.account)
          || !Number.isFinite(expiresAt) || expiresAt <= Date.now())
    ) {
      clearPersistedState();
      return localState;
    }
    return {
      ...localState,
      mode: value.mode === 'fighter-account' ? 'fighter-account' : value.mode === 'household-device' ? 'household-device' : 'adult-account',
      status: 'restoring',
      sessionToken: value.sessionToken ?? null,
      householdDeviceToken: value.householdDeviceToken ?? null,
      sessionExpiresAt: value.sessionExpiresAt ?? null,
      userId: value.userId ?? null,
      deviceId: value.deviceId ?? null,
      householdId: value.householdId ?? null,
      fighterId: value.fighterId ?? null,
      role: value.role ?? null,
      account: value.account ?? null,
      householdName: value.householdName ?? null,
      lastSyncCursor: value.lastSyncCursor ?? null,
      lastSuccessfulSyncAt: value.lastSuccessfulSyncAt ?? null,
      configurationRevision: typeof value.configurationRevision === 'number' && Number.isSafeInteger(value.configurationRevision) ? value.configurationRevision : 0,
      configurationConnectedAt: value.configurationConnectedAt ?? null,
      entityMappings: value.entityMappings ?? null,
    };
  } catch {
    clearPersistedState();
    return localState;
  }
}

function persistState(state: OnlineState) {
  const validUser = Boolean(state.sessionToken && state.sessionExpiresAt && state.userId && state.account);
  const validHouseholdDevice = Boolean(state.mode === 'household-device' && state.householdDeviceToken && state.deviceId && state.householdId);
  if (state.mode === 'local' || (!validUser && !validHouseholdDevice)) {
    clearPersistedState();
    persistCredentials(localState);
    return;
  }
  const publicCredentials = credentialsForPublicStorage({
    sessionToken: state.sessionToken,
    householdDeviceToken: state.householdDeviceToken,
  }, usesNativeCredentialStorage());
  const persisted: PersistedOnlineState = {
    version: 2,
    mode: state.mode,
    sessionToken: publicCredentials.sessionToken,
    householdDeviceToken: publicCredentials.householdDeviceToken,
    sessionExpiresAt: state.sessionExpiresAt,
    userId: state.userId,
    deviceId: state.deviceId,
    householdId: state.householdId,
    fighterId: state.fighterId,
    role: state.role,
    account: state.account,
    householdName: state.householdName,
    lastSyncCursor: state.lastSyncCursor,
    lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
    configurationRevision: state.configurationRevision,
    configurationConnectedAt: state.configurationConnectedAt,
    entityMappings: state.entityMappings,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  localStorage.removeItem('boss-kamp-online-session-v1');
  persistCredentials(state);
}

function errorCode(error: unknown, operation: 'auth' | 'restore' | 'other'): OnlineError {
  if (!(error instanceof ApiError)) return 'unknown';
  if (error.kind === 'network') return 'network';
  if (error.kind === 'server') return 'server';
  if (error.kind === 'conflict') return operation === 'auth' ? 'account-exists' : 'invalid-request';
  if (error.kind === 'unauthenticated') return operation === 'restore' ? 'session-ended' : 'invalid-credentials';
  if (error.kind === 'validation' || error.kind === 'forbidden') return 'invalid-request';
  return 'unknown';
}

function stateFromAuth(session: AuthSession): OnlineState {
  return {
    ...localState,
    mode: session.user.kind === 'child' ? 'fighter-account' : 'adult-account',
    status: 'authenticated',
    sessionToken: session.token,
    sessionExpiresAt: session.expiresAt,
    userId: session.user.id,
    deviceId: session.deviceId,
    fighterId: session.fighterId,
    account: session.user,
  };
}

const OnlineContext = createContext<OnlineContextValue | null>(null);

export function OnlineProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnlineState>(loadPersistedState);
  const [credentialsReady, setCredentialsReady] = useState(!usesNativeCredentialStorage());
  const [pendingMutations, setPendingMutations] = useState<PendingMutation[]>(loadPendingMutations);
  const syncPromiseRef = useRef<Promise<ServerSyncState | null> | null>(null);
  const syncRerunRef = useRef(false);
  const restorationStartedRef = useRef(false);

  useEffect(() => {
    if (!usesNativeCredentialStorage()) return;
    let active = true;
    void (async () => {
      try {
        const secure = await loadNativeCredentials();
        if (!active) return;
        const credentials = credentialsToRestore(secure, {
          sessionToken: state.sessionToken,
          householdDeviceToken: state.householdDeviceToken,
        });
        if (!credentials.sessionToken && !credentials.householdDeviceToken) {
          clearPersistedState();
          setState(localState);
          return;
        }
        if (!secure && (credentials.sessionToken || credentials.householdDeviceToken)) {
          await saveNativeCredentials(credentials);
        }
        if (!active) return;
        setState((current) => {
          const next = { ...current, ...credentials };
          persistState(next);
          return next;
        });
      } catch (error) {
        console.warn('Could not restore native credentials', error);
        await clearNativeCredentials().catch(() => undefined);
        clearPersistedState();
        setState({ ...localState, status: 'error', error: 'unknown' });
      } finally {
        if (active) setCredentialsReady(true);
      }
    })();
    return () => { active = false; };
    // Native credential hydration runs exactly once before session restoration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setState((current) => ({
      ...current,
      pendingMutationCount: pendingMutations.filter((mutation) => mutation.householdId === current.householdId && !mutation.rejectedAt).length,
      rejectedMutationCount: pendingMutations.filter((mutation) => mutation.householdId === current.householdId && Boolean(mutation.rejectedAt)).length,
    }));
  }, [pendingMutations, state.householdId]);

  const replaceState = useCallback((next: OnlineState) => {
    setState(next);
    persistState(next);
  }, []);

  const refreshIdentity = useCallback(async () => {
    if (state.mode === 'household-device' && state.householdDeviceToken && state.householdId) {
      setState((current) => ({ ...current, status: 'authenticated', error: null }));
      return;
    }
    const token = state.sessionToken;
    if (!token) return;
    setState((current) => ({ ...current, status: 'restoring', error: null }));

    try {
      const me = await getMe(token);
      setState((current) => {
        if (current.sessionToken !== token) return current;
        const membership = me.households.find((item) => item.id === current.householdId) ?? me.households[0] ?? null;
        const next: OnlineState = {
          ...current,
          mode: me.user.kind === 'child' ? 'fighter-account' : 'adult-account',
          status: 'authenticated',
          userId: me.user.id,
          account: me.user,
          householdId: membership?.id ?? null,
          householdName: membership?.name ?? null,
          role: membership?.role ?? null,
          configurationConnectedAt: membership
            ? (current.configurationConnectedAt ?? new Date().toISOString())
            : null,
          error: null,
        };
        persistState(next);
        return next;
      });
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'unauthenticated') {
        clearPersistedState();
        void clearNativeCredentials().catch(() => undefined);
        setState({ ...localState, error: 'session-ended' });
        return;
      }
      setState((current) => ({
        ...current,
        status: error instanceof ApiError && error.isTransient ? 'offline' : 'error',
        error: errorCode(error, 'restore'),
      }));
    }
  }, [state.householdDeviceToken, state.householdId, state.mode, state.sessionToken]);

  useEffect(() => {
    if (!credentialsReady || restorationStartedRef.current) return;
    restorationStartedRef.current = true;
    if (state.status === 'restoring') void refreshIdentity();
  }, [credentialsReady, refreshIdentity, state.status]);

  useEffect(() => {
    const reconnect = () => {
      if ((state.sessionToken || state.householdDeviceToken) && state.status === 'offline') void refreshIdentity();
    };
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, [refreshIdentity, state.householdDeviceToken, state.sessionToken, state.status]);

  const authenticate = useCallback(async (request: () => Promise<AuthSession>) => {
    setState((current) => ({ ...current, status: 'syncing', error: null }));
    let authenticated: OnlineState | null = null;
    try {
      const session = await request();
      authenticated = stateFromAuth(session);
      replaceState({ ...authenticated, status: 'restoring' });
      const me = await getMe(session.token);
      const membership = me.households[0] ?? null;
      replaceState({
        ...authenticated,
        householdId: membership?.id ?? null,
        householdName: membership?.name ?? null,
        role: membership?.role ?? null,
        configurationConnectedAt: membership ? new Date().toISOString() : null,
      });
    } catch (error) {
      if (authenticated && error instanceof ApiError && error.isTransient) {
        replaceState({ ...authenticated, status: 'offline', error: errorCode(error, 'other') });
      } else {
        setState((current) => ({ ...current, status: 'error', error: errorCode(error, 'auth') }));
      }
      throw error;
    }
  }, [replaceState]);

  const enqueueMutation = useCallback((type: SyncMutationType, payload: Record<string, unknown>) => {
    if (!state.householdId) throw new ApiError('Household connection required', 'validation');
    const id = crypto.randomUUID();
    const mutation: PendingMutation = {
      id,
      householdId: state.householdId,
      type,
      payload: type === 'configuration_replace' ? { ...payload, expectedRevision: state.configurationRevision } : payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    setPendingMutations((current) => {
      const retained = type === 'configuration_replace'
        ? current.filter((item) => item.householdId !== mutation.householdId || item.type !== 'configuration_replace' || Boolean(item.rejectedAt))
        : current;
      const next = [...retained, mutation];
      persistPendingMutations(next);
      setState((online) => ({ ...online, pendingMutationCount: next.length }));
      return next;
    });
    return id;
  }, [state.configurationRevision, state.householdId]);

  const flushMutations = useCallback(async (): Promise<ServerSyncState | null> => {
    if (syncPromiseRef.current) {
      syncRerunRef.current = true;
      return syncPromiseRef.current;
    }
    const token = state.sessionToken;
    const householdDeviceToken = state.householdDeviceToken;
    const householdId = state.householdId;
    if ((!token && !householdDeviceToken) || !householdId) return null;
    // Read durable storage so a mutation enqueued immediately before this call
    // is included even if React has not committed the state update yet.
    const run = async () => {
      let latest: ServerSyncState | null = null;
      do {
        syncRerunRef.current = false;
        const pending = sendableMutations(loadPendingMutations(), householdId);
        setState((current) => ({ ...current, status: 'syncing', error: null }));
        try {
          if (pending.length > 0) {
            const pushed = await pushSyncMutations(token, householdId, pending, householdDeviceToken);
            const rejectedAt = new Date().toISOString();
            setPendingMutations((current) => {
              const next = applyMutationResults(current, householdId, pushed.results, rejectedAt);
              persistPendingMutations(next);
              return next;
            });
          }
          const cachedEvents = loadSyncEventCache(householdId);
          const cachedAvatars = loadAvatarCache(householdId);
          const cachedConfiguration = loadConfigurationCache(householdId);
          latest = await pullSyncState(token, householdId, syncCursors(cachedEvents), knownAvatarHashes(cachedAvatars), cachedConfiguration?.revision ?? null, householdDeviceToken);
          latest = { ...latest, events: mergeSyncEvents(cachedEvents, latest.events) };
          latest = mergeConfigurationCache(latest, cachedConfiguration);
          latest.mutable.fighter_avatars = mergeAvatarCache(latest.mutable.fighters, cachedAvatars, latest.mutable.fighter_avatars);
          saveSyncEventCache(householdId, latest.events);
          saveAvatarCache(householdId, latest.mutable.fighter_avatars);
          saveConfigurationCache(householdId, latest);
          const syncedAt = new Date().toISOString();
          const revision = latest.configurationRevision;
          setState((current) => {
            const next = { ...current, status: 'authenticated' as const, configurationRevision: revision, lastSuccessfulSyncAt: syncedAt, error: null };
            persistState(next);
            return next;
          });
        } catch (error) {
          setPendingMutations((current) => {
            const next = current.map((mutation) => sentIdsForHousehold(mutation, householdId) && !mutation.rejectedAt
              ? { ...mutation, attempts: mutation.attempts + 1, lastError: error instanceof Error ? error.message : String(error) }
              : mutation);
            persistPendingMutations(next);
            return next;
          });
          setState((current) => ({ ...current, status: error instanceof ApiError && error.isTransient ? 'offline' : 'error', error: errorCode(error, 'other') }));
          throw error;
        }
      } while (syncRerunRef.current);
      return latest;
    };
    syncPromiseRef.current = run().finally(() => { syncPromiseRef.current = null; });
    return syncPromiseRef.current;
  }, [pendingMutations, state.householdDeviceToken, state.householdId, state.sessionToken]);

  const actions = useMemo<OnlineActions>(() => ({
    registerAdult: (email, password, displayName) => authenticate(() => registerAdultRequest(email, password, displayName)),
    loginAdult: (email, password) => authenticate(() => loginAdultRequest(email, password)),
    loginChild: (householdId, fighterId, pin, deviceName, platform) => authenticate(() => loginChildRequest(householdId, fighterId, pin, deviceName, platform)),
    loginChildWithPairing: (code, pin, deviceName, platform) => authenticate(() => loginChildWithPairingRequest(code, pin, deviceName, platform)),
    pairHouseholdDevice: async (code, deviceName, platform) => {
      setState((current) => ({ ...current, status: 'syncing', error: null }));
      try {
        const claimed = await claimHouseholdDeviceRequest(code, deviceName, platform);
        replaceState({
          ...localState,
          mode: 'household-device',
          status: 'authenticated',
          householdDeviceToken: claimed.deviceToken,
          deviceId: claimed.deviceId,
          householdId: claimed.householdId,
          configurationConnectedAt: new Date().toISOString(),
        });
      } catch (error) {
        setState((current) => ({ ...current, status: 'error', error: errorCode(error, 'auth') }));
        throw error;
      }
    },
    logout: async () => {
      const token = state.sessionToken;
      try {
        if (token) await logoutOnline(token);
      } catch {
        // Local logout must work while offline; the remote session expires or
        // can be revoked from another authenticated device later.
      } finally {
        if (state.householdId) {
          clearSyncEventCache(state.householdId);
          clearAvatarCache(state.householdId);
          clearConfigurationCache(state.householdId);
        }
        await clearNativeCredentials().catch(() => undefined);
        replaceState(localState);
      }
    },
    forgetHousehold: (householdId) => {
      clearSyncEventCache(householdId);
      clearAvatarCache(householdId);
      clearConfigurationCache(householdId);
      const retained = loadPendingMutations().filter((mutation) => mutation.householdId !== householdId);
      persistPendingMutations(retained);
      setPendingMutations(retained);
      replaceState({
        ...state,
        status: 'authenticated', householdId: null, householdName: null, role: null,
        householdDeviceToken: null, deviceId: null, fighterId: null,
        lastSyncCursor: null, lastSuccessfulSyncAt: null, configurationRevision: 0,
        configurationConnectedAt: null, entityMappings: null,
        pendingMutationCount: retained.length,
        rejectedMutationCount: retained.filter((mutation) => Boolean(mutation.rejectedAt)).length,
        error: null,
      });
    },
    createHousehold: async (name, snapshot) => {
      if (!state.sessionToken) throw new ApiError('Authentication required', 'unauthenticated');
      setState((current) => ({ ...current, status: 'syncing', error: null }));
      try {
        const result = await bootstrapHouseholdRequest(state.sessionToken, name, snapshot);
        const configuration = await getHouseholdConfig(state.sessionToken, result.householdId);
        const connectedAt = new Date().toISOString();
        const next: OnlineState = {
          ...state,
          status: 'authenticated',
          householdId: result.householdId,
          householdName: name.trim(),
          role: 'owner',
          configurationConnectedAt: connectedAt,
          entityMappings: result.ids,
          lastSuccessfulSyncAt: connectedAt,
          configurationRevision: Number(configuration.household.configuration_revision ?? 0),
          error: null,
        };
        replaceState(next);
        return configuration;
      } catch (error) {
        setState((current) => ({
          ...current,
          status: error instanceof ApiError && error.isTransient ? 'offline' : 'error',
          error: errorCode(error, 'other'),
        }));
        throw error;
      }
    },
    getConfiguration: async () => {
      if (!state.sessionToken || !state.householdId) throw new ApiError('Household connection required', 'validation');
      return getHouseholdConfig(state.sessionToken, state.householdId);
    },
    enqueueMutation,
    flushMutations,
    refreshIdentity,
    syncNow: flushMutations,
  }), [authenticate, enqueueMutation, flushMutations, refreshIdentity, replaceState, state]);

  const value = useMemo(() => ({ state, actions }), [actions, state]);
  return <OnlineContext.Provider value={value}>{children}</OnlineContext.Provider>;
}

function sentIdsForHousehold(mutation: PendingMutation, householdId: string) {
  return mutation.householdId === householdId;
}

export function useOnline() {
  const value = useContext(OnlineContext);
  if (!value) throw new Error('useOnline must be used inside OnlineProvider');
  return value;
}

export function mayActAsFighter(state: OnlineState, fighter: Fighter) {
  if (state.mode === 'local') return true;
  const ownsFighter = Boolean(state.userId && fighter.userId === state.userId);
  return ownsFighter || !fighter.userId;
}

export function mayManageHousehold(state: OnlineState) {
  return state.mode === 'local' || (state.mode === 'adult-account' && (state.role === 'owner' || state.role === 'parent'));
}
