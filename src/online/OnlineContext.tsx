import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ApiError,
  bootstrapHousehold as bootstrapHouseholdRequest,
  getMe,
  loginAdult as loginAdultRequest,
  loginChild as loginChildRequest,
  logoutOnline,
  registerAdult as registerAdultRequest,
  type AuthSession,
  type HouseholdRole,
  type OnlineUser,
} from './api';

const STORAGE_KEY = 'boss-kamp-online-state-v2';

export type OnlineMode = 'local' | 'adult-account' | 'household-device' | 'fighter-account';
export type OnlineStatus = 'idle' | 'restoring' | 'authenticated' | 'syncing' | 'offline' | 'error';
export type OnlineError = 'invalid-credentials' | 'account-exists' | 'session-ended' | 'network' | 'server' | 'invalid-request' | 'unknown';

export interface OnlineState {
  mode: OnlineMode;
  status: OnlineStatus;
  sessionToken: string | null;
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
  error: OnlineError | null;
}

interface PersistedOnlineState {
  version: 2;
  mode: Exclude<OnlineMode, 'local'>;
  sessionToken: string;
  sessionExpiresAt: string;
  userId: string;
  deviceId: string | null;
  householdId: string | null;
  fighterId: string | null;
  role: HouseholdRole | null;
  account: OnlineUser;
  householdName: string | null;
  lastSyncCursor: string | number | null;
  lastSuccessfulSyncAt: string | null;
}

interface OnlineActions {
  registerAdult(email: string, password: string, displayName: string): Promise<void>;
  loginAdult(email: string, password: string): Promise<void>;
  loginChild(householdId: string, fighterId: string, pin: string, deviceName: string, platform: string): Promise<void>;
  logout(): Promise<void>;
  createHousehold(name: string): Promise<void>;
  refreshIdentity(): Promise<void>;
  syncNow(): Promise<void>;
}

interface OnlineContextValue {
  state: OnlineState;
  actions: OnlineActions;
}

const localState: OnlineState = {
  mode: 'local', status: 'idle', sessionToken: null, sessionExpiresAt: null,
  userId: null, deviceId: null, householdId: null, fighterId: null, role: null,
  account: null, householdName: null, lastSyncCursor: null,
  lastSuccessfulSyncAt: null, pendingMutationCount: 0, error: null,
};

function clearPersistedState() {
  localStorage.removeItem(STORAGE_KEY);
  // Remove the short-lived key used by PR #18 after its data has been superseded.
  localStorage.removeItem('boss-kamp-online-session-v1');
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
    const expiresAt = typeof value.sessionExpiresAt === 'string' ? Date.parse(value.sessionExpiresAt) : Number.NaN;
    if (
      value.version !== 2
      || typeof value.sessionToken !== 'string'
      || typeof value.userId !== 'string'
      || !isOnlineUser(value.account)
      || !Number.isFinite(expiresAt)
      || expiresAt <= Date.now()
    ) {
      clearPersistedState();
      return localState;
    }
    return {
      ...localState,
      mode: value.mode === 'fighter-account' ? 'fighter-account' : value.mode === 'household-device' ? 'household-device' : 'adult-account',
      status: 'restoring',
      sessionToken: value.sessionToken,
      sessionExpiresAt: value.sessionExpiresAt!,
      userId: value.userId,
      deviceId: value.deviceId ?? null,
      householdId: value.householdId ?? null,
      fighterId: value.fighterId ?? null,
      role: value.role ?? null,
      account: value.account,
      householdName: value.householdName ?? null,
      lastSyncCursor: value.lastSyncCursor ?? null,
      lastSuccessfulSyncAt: value.lastSuccessfulSyncAt ?? null,
    };
  } catch {
    clearPersistedState();
    return localState;
  }
}

function persistState(state: OnlineState) {
  if (!state.sessionToken || !state.sessionExpiresAt || !state.userId || !state.account || state.mode === 'local') {
    clearPersistedState();
    return;
  }
  const persisted: PersistedOnlineState = {
    version: 2,
    mode: state.mode,
    sessionToken: state.sessionToken,
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
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  localStorage.removeItem('boss-kamp-online-session-v1');
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

  const replaceState = useCallback((next: OnlineState) => {
    setState(next);
    persistState(next);
  }, []);

  const refreshIdentity = useCallback(async () => {
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
          error: null,
        };
        persistState(next);
        return next;
      });
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'unauthenticated') {
        clearPersistedState();
        setState({ ...localState, error: 'session-ended' });
        return;
      }
      setState((current) => ({
        ...current,
        status: error instanceof ApiError && error.isTransient ? 'offline' : 'error',
        error: errorCode(error, 'restore'),
      }));
    }
  }, [state.sessionToken]);

  useEffect(() => {
    if (state.status === 'restoring') void refreshIdentity();
    // Session restoration only runs on provider mount. Network events below handle retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const reconnect = () => {
      if (state.sessionToken && state.status === 'offline') void refreshIdentity();
    };
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, [refreshIdentity, state.sessionToken, state.status]);

  const authenticate = useCallback(async (request: () => Promise<AuthSession>) => {
    setState((current) => ({ ...current, status: 'syncing', error: null }));
    try {
      replaceState(stateFromAuth(await request()));
    } catch (error) {
      setState((current) => ({ ...current, status: 'error', error: errorCode(error, 'auth') }));
      throw error;
    }
  }, [replaceState]);

  const actions = useMemo<OnlineActions>(() => ({
    registerAdult: (email, password, displayName) => authenticate(() => registerAdultRequest(email, password, displayName)),
    loginAdult: (email, password) => authenticate(() => loginAdultRequest(email, password)),
    loginChild: (householdId, fighterId, pin, deviceName, platform) => authenticate(() => loginChildRequest(householdId, fighterId, pin, deviceName, platform)),
    logout: async () => {
      const token = state.sessionToken;
      try {
        if (token) await logoutOnline(token);
      } catch {
        // Local logout must work while offline; the remote session expires or
        // can be revoked from another authenticated device later.
      } finally {
        replaceState(localState);
      }
    },
    createHousehold: async (name) => {
      if (!state.sessionToken || state.householdId) return;
      setState((current) => ({ ...current, status: 'syncing', error: null }));
      try {
        const result = await bootstrapHouseholdRequest(state.sessionToken, name);
        const next: OnlineState = {
          ...state,
          status: 'authenticated',
          householdId: result.householdId,
          householdName: name.trim(),
          role: 'owner',
          error: null,
        };
        replaceState(next);
      } catch (error) {
        setState((current) => ({
          ...current,
          status: error instanceof ApiError && error.isTransient ? 'offline' : 'error',
          error: errorCode(error, 'other'),
        }));
        throw error;
      }
    },
    refreshIdentity,
    syncNow: refreshIdentity,
  }), [authenticate, refreshIdentity, replaceState, state]);

  const value = useMemo(() => ({ state, actions }), [actions, state]);
  return <OnlineContext.Provider value={value}>{children}</OnlineContext.Provider>;
}

export function useOnline() {
  const value = useContext(OnlineContext);
  if (!value) throw new Error('useOnline must be used inside OnlineProvider');
  return value;
}
