import { recordDiagnostic } from './diagnostics';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
  ?? 'https://boss-kamp.vardir.no';

export type HouseholdRole = 'owner' | 'parent' | 'member' | 'child';

export interface OnlineUser {
  id: string;
  email: string | null;
  displayName: string;
  kind: 'adult' | 'child';
  emailVerified: boolean;
}

export interface HouseholdMembership {
  id: string;
  name: string;
  timezone: string;
  role: HouseholdRole;
}

export interface AuthSession {
  token: string;
  expiresAt: string;
  user: OnlineUser;
  fighterId: string | null;
  deviceId: string | null;
}

export interface AccountSession {
  id: string;
  current: boolean;
  deviceName: string | null;
  platform: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
}

export interface BootstrapSnapshot {
  /** The fighter generated from the authenticated household owner's account. */
  ownerFighterClientId?: string;
  victoriesBaseline: number;
  pool: number;
  fighters: Array<{
    clientId: string;
    name: string;
    color: string;
    avatar?: { mime: string; bytesBase64: string; hash: string };
    streak: number;
    coins: number;
    careerXp: number;
    sort: number;
  }>;
  bosses: Array<{
    clientId: string;
    name: string;
    sprite: string;
    frames: number;
    rare: boolean;
    hue?: number;
    trigger: { type: string; day?: number; date?: number; note?: string };
    dormant: boolean;
    unlockAt: number;
    sort: number;
  }>;
  chores: Array<{
    clientId: string;
    bossClientId: string;
    title: string;
    damage: number;
    repeatable: boolean;
    sort: number;
  }>;
  rewards: Array<{
    clientId: string;
    scope: 'personal' | 'group';
    icon: string;
    title: string;
    description: string;
    cost: number;
    sort: number;
  }>;
}

export interface BootstrapResult {
  householdId: string;
  created: boolean;
  ids: {
    fighters: Record<string, string>;
    bosses: Record<string, string>;
    chores: Record<string, string>;
    rewards: Record<string, string>;
  };
}

export interface ServerHouseholdConfig {
  household: Record<string, unknown>;
  fighters: Array<Record<string, unknown>>;
  fighterAvatars: Array<Record<string, unknown>>;
  bosses: Array<Record<string, unknown>>;
  chores: Array<Record<string, unknown>>;
  rewards: Array<Record<string, unknown>>;
  balances: Array<Record<string, unknown>>;
}

export type SyncMutationType =
  | 'configuration_replace'
  | 'chore_completion'
  | 'boss_reset'
  | 'wallet_transfer'
  | 'reward_redemption'
  | 'reward_redemption_update';

export interface PendingMutation {
  id: string;
  householdId: string;
  type: SyncMutationType;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError?: string;
  rejectedAt?: string;
  rejectionCode?: string;
}

export interface SyncMutationResult {
  id: string;
  type: SyncMutationType;
  outcome: 'accepted' | 'duplicate' | 'conflict' | 'rejected';
  code?: string;
  error?: string;
  configurationRevision?: number;
  ids?: Record<string, Record<string, string>>;
}

/**
 * Running totals over the complete event history, folded client-side as pages arrive.
 *
 * The client retains only a bounded tail of raw events, so anything that needs the
 * whole stream — wallet balances, career XP, victory counts — is accumulated here and
 * carried across pulls instead of being recomputed from retained rows.
 */
export interface SyncTotals {
  cursors: SyncCursors;
  /** Wallet balance per fighter id. */
  coins: Record<string, number>;
  /** Shared-pool balance (`fighter_id is null`). */
  pool: number;
  /** Damage dealt since the household went online, per fighter id. */
  careerXp: Record<string, number>;
  /** Local calendar days each fighter completed a chore on, bounded to the recent past. */
  activeDays: Record<string, string[]>;
  victories: number;
  rareVictory: boolean;
}

export interface ServerSyncState {
  serverTime: string;
  configurationRevision: number;
  configurationUnchanged?: boolean;
  eventHasMore?: Record<keyof ServerSyncState['events'], boolean>;
  /** Client-derived, not part of the server response; see {@link SyncTotals}. */
  totals?: SyncTotals;
  mutable: {
    households: Array<Record<string, unknown>>;
    fighters: Array<Record<string, unknown>>;
    fighter_avatars: Array<Record<string, unknown>>;
    bosses: Array<Record<string, unknown>>;
    chores: Array<Record<string, unknown>>;
  };
  events: {
    chore_completions: Array<Record<string, unknown>>;
    boss_resets: Array<Record<string, unknown>>;
    boss_victories: Array<Record<string, unknown>>;
    wallet_transactions: Array<Record<string, unknown>>;
    reward_redemptions: Array<Record<string, unknown>>;
  };
}

export type SyncCursors = Record<keyof ServerSyncState['events'], number>;

export type ApiErrorKind = 'network' | 'unauthenticated' | 'forbidden' | 'conflict' | 'validation' | 'server' | 'unknown';
export const PRIVACY_NOTICE_VERSION = '2026-08-05.4';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: ApiErrorKind,
    readonly status: number | null = null,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isTransient() {
    return this.kind === 'network' || this.kind === 'server';
  }
}

interface AuthResponse {
  user?: {
    id?: unknown;
    email?: unknown;
    display_name?: unknown;
    displayName?: unknown;
    kind?: unknown;
    emailVerified?: unknown;
    email_verified_at?: unknown;
  };
  session?: {
    token?: unknown;
    expiresAt?: unknown;
    expires_at?: unknown;
  };
  fighterId?: unknown;
  deviceId?: unknown;
}

interface MeResponse {
  user?: AuthResponse['user'];
  households?: Array<{
    id?: unknown;
    name?: unknown;
    timezone?: unknown;
    role?: unknown;
  }>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ApiError(`Invalid API response: ${field}`, 'server');
  }
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeUser(user: AuthResponse['user']): OnlineUser {
  if (!user) throw new ApiError('Invalid API response: user', 'server');
  const kind = user.kind === 'child' ? 'child' : 'adult';
  return {
    id: requiredString(user.id, 'user.id'),
    email: nullableString(user.email),
    displayName: nullableString(user.displayName) ?? nullableString(user.display_name) ?? '',
    kind,
    emailVerified: user.emailVerified === true || typeof user.email_verified_at === 'string',
  };
}

function normalizeAuth(result: AuthResponse): AuthSession {
  if (!result.session) throw new ApiError('Invalid API response: session', 'server');
  return {
    token: requiredString(result.session.token, 'session.token'),
    expiresAt: requiredString(result.session.expiresAt ?? result.session.expires_at, 'session.expiresAt'),
    user: normalizeUser(result.user),
    fighterId: nullableString(result.fighterId),
    deviceId: nullableString(result.deviceId),
  };
}

function errorKind(status: number): ApiErrorKind {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 409) return 'conflict';
  if (status >= 500) return 'server';
  if (status === 400 || status === 404 || status === 422 || status === 429) return 'validation';
  return 'unknown';
}

async function request<T>(path: string, init: RequestInit = {}, token?: string | null, householdDeviceToken?: string | null): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(householdDeviceToken ? { 'x-boss-kamp-device-token': householdDeviceToken } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    recordDiagnostic({ area: 'api', operation: path, outcome: 'offline', code: 'network' });
    throw new ApiError(error instanceof Error ? error.message : 'Network unavailable', 'network');
  }

  const payload = await response.json().catch(() => ({})) as { error?: unknown; code?: unknown };
  if (!response.ok) {
    recordDiagnostic({
      area: 'api', operation: path, outcome: 'error',
      code: typeof payload.code === 'string' ? payload.code : `http_${response.status}`,
      requestId: response.headers.get('x-request-id') ?? undefined,
    });
    throw new ApiError(
      typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`,
      errorKind(response.status),
      response.status,
      typeof payload.code === 'string' ? payload.code : null,
    );
  }
  return payload as T;
}

export async function registerAdult(email: string, password: string, displayName: string) {
  return normalizeAuth(await request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName }),
  }));
}

export async function loginAdult(email: string, password: string) {
  return normalizeAuth(await request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }));
}

export async function requestPasswordReset(email: string) {
  await request('/api/auth/password-reset/request', {
    method: 'POST', body: JSON.stringify({ email }),
  });
}

export async function confirmPasswordReset(token: string, password: string) {
  await request('/api/auth/password-reset/confirm', {
    method: 'POST', body: JSON.stringify({ token, password }),
  });
}

export async function resendEmailVerification(token: string) {
  await request('/api/auth/email-verification/resend', { method: 'POST', body: '{}' }, token);
}

export async function confirmEmailVerification(token: string) {
  await request('/api/auth/email-verification/confirm', { method: 'POST', body: JSON.stringify({ token }) });
}

export async function loginChild(householdId: string, fighterId: string, pin: string, deviceName: string, platform: string) {
  return normalizeAuth(await request<AuthResponse>('/api/auth/child-login', {
    method: 'POST',
    body: JSON.stringify({ householdId, fighterId, pin, deviceName, platform }),
  }));
}

export async function loginChildWithPairing(code: string, pin: string, deviceName: string, platform: string) {
  return normalizeAuth(await request<AuthResponse>('/api/auth/child-pair', {
    method: 'POST',
    body: JSON.stringify({ code, pin, deviceName, platform }),
  }));
}

export async function setupChildFighter(token: string, householdId: string, fighterId: string, pin: string) {
  return request<{ fighter: Record<string, unknown> }>(`/api/households/${encodeURIComponent(householdId)}/children`, {
    method: 'POST', body: JSON.stringify({
      fighterId, pin, authorized: true, privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    }),
  }, token);
}

export async function resetChildPin(token: string, householdId: string, fighterId: string, pin: string) {
  return request<{ ok: boolean }>(`/api/households/${encodeURIComponent(householdId)}/fighters/${encodeURIComponent(fighterId)}/pin`, {
    method: 'POST', body: JSON.stringify({ pin }),
  }, token);
}

export async function createFighterPairing(token: string, householdId: string, fighterId: string) {
  return request<{ code: string; pairing: Record<string, unknown> }>(`/api/households/${encodeURIComponent(householdId)}/pairings`, {
    method: 'POST', body: JSON.stringify({ role: 'fighter', fighterId }),
  }, token);
}

export async function inviteAdultFighter(token: string, householdId: string, fighterId: string, email: string) {
  return request<{ delivered: true; invite: Record<string, unknown> }>(`/api/households/${encodeURIComponent(householdId)}/invites`, {
    method: 'POST', body: JSON.stringify({ fighterId, email, role: 'member' }),
  }, token);
}

export async function inviteParent(token: string, householdId: string, email: string) {
  return request<{ delivered: true; invite: Record<string, unknown> }>(`/api/households/${encodeURIComponent(householdId)}/invites`, {
    method: 'POST', body: JSON.stringify({ email, role: 'parent' }),
  }, token);
}

export async function acceptHouseholdInvite(token: string, inviteToken: string) {
  return request<{ member: Record<string, unknown>; fighter: Record<string, unknown> | null }>('/api/invites/accept', {
    method: 'POST', body: JSON.stringify({ token: inviteToken }),
  }, token);
}

export async function suspendFighterAccess(token: string, householdId: string, fighterId: string, suspended = true) {
  return request<{ ok: boolean }>(`/api/households/${encodeURIComponent(householdId)}/fighters/${encodeURIComponent(fighterId)}/suspend`, {
    method: 'POST', body: JSON.stringify({ suspended }),
  }, token);
}

export async function unlinkFighterAccount(token: string, householdId: string, fighterId: string) {
  return request<{ fighter: Record<string, unknown> }>(`/api/households/${encodeURIComponent(householdId)}/fighters/${encodeURIComponent(fighterId)}/unlink`, {
    method: 'POST', body: '{}',
  }, token);
}

export async function eraseChildData(token: string, householdId: string, fighterId: string) {
  return request<{ ok: boolean; retainedFighterId: string }>(
    `/api/households/${encodeURIComponent(householdId)}/children/${encodeURIComponent(fighterId)}`,
    { method: 'DELETE' },
    token,
  );
}

export async function bootstrapHousehold(token: string, householdName: string, snapshot?: BootstrapSnapshot) {
  const result = await request<{
    householdId?: unknown;
    created?: unknown;
    ids?: BootstrapResult['ids'];
  }>('/api/bootstrap', {
    method: 'POST',
    body: JSON.stringify({
      householdName,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Oslo',
      ...snapshot,
    }),
  }, token);
  return {
    householdId: requiredString(result.householdId, 'householdId'),
    created: result.created !== false,
    ids: result.ids ?? { fighters: {}, bosses: {}, chores: {}, rewards: {} },
  };
}

export async function getHouseholdConfig(token: string, householdId: string) {
  const result = await request<Partial<ServerHouseholdConfig>>(`/api/households/${encodeURIComponent(householdId)}/config`, {}, token);
  if (!result.household || !Array.isArray(result.fighters) || !Array.isArray(result.bosses)
    || !Array.isArray(result.chores) || !Array.isArray(result.rewards)) {
    throw new ApiError('Invalid API response: household config', 'server');
  }
  return {
    household: result.household,
    fighters: result.fighters,
    fighterAvatars: Array.isArray(result.fighterAvatars) ? result.fighterAvatars : [],
    bosses: result.bosses,
    chores: result.chores,
    rewards: result.rewards,
    balances: Array.isArray(result.balances) ? result.balances : [],
  } satisfies ServerHouseholdConfig;
}

export async function getHouseholdExport(token: string, householdId: string) {
  const result = await request<Record<string, unknown>>(
    `/api/households/${encodeURIComponent(householdId)}/export`,
    {},
    token,
  );
  if (result.format !== 'boss-kamp-household-export' || typeof result.exportedAt !== 'string'
    || !result.data || typeof result.data !== 'object') {
    throw new ApiError('Invalid API response: household export', 'server');
  }
  return result;
}

export async function eraseHousehold(token: string, householdId: string, password: string, confirmedName: string) {
  return request<{ ok: boolean }>(`/api/households/${encodeURIComponent(householdId)}`, {
    method: 'DELETE', body: JSON.stringify({ password, confirmedName }),
  }, token);
}

export async function eraseAdultAccount(token: string, password: string, confirmedEmail: string) {
  return request<{ ok: boolean }>('/api/me', {
    method: 'DELETE', body: JSON.stringify({ password, confirmedEmail }),
  }, token);
}

export async function pushSyncMutations(token: string | null, householdId: string, mutations: PendingMutation[], householdDeviceToken?: string | null) {
  return request<{ results: SyncMutationResult[]; accepted: Array<Record<string, unknown>> }>('/api/sync/push', {
    method: 'POST',
    body: JSON.stringify({
      householdId,
      mutations: mutations.map((mutation) => ({
        type: mutation.type,
        payload: { ...mutation.payload, id: mutation.id },
      })),
    }),
  }, token, householdDeviceToken);
}

export async function pullSyncState(token: string | null, householdId: string, cursors: SyncCursors, avatarHashes: Record<string, string>, configurationRevision: number | null, householdDeviceToken?: string | null) {
  const query = new URLSearchParams({
    household_id: householdId,
    since_chore_completions: String(cursors.chore_completions),
    since_boss_resets: String(cursors.boss_resets),
    since_boss_victories: String(cursors.boss_victories),
    since_wallet_transactions: String(cursors.wallet_transactions),
    since_reward_redemptions: String(cursors.reward_redemptions),
    known_avatar_hashes: JSON.stringify(avatarHashes),
  });
  if (configurationRevision !== null) query.set('known_configuration_revision', String(configurationRevision));
  const result = await request<Partial<ServerSyncState>>(`/api/sync/pull?${query}`, {}, token, householdDeviceToken);
  if (!result.mutable || !result.events || typeof result.serverTime !== 'string') {
    throw new ApiError('Invalid API response: sync state', 'server');
  }
  const revision = Number(result.configurationRevision ?? result.mutable.households[0]?.configuration_revision ?? 0);
  return { ...result, configurationRevision: revision, configurationUnchanged: result.configurationUnchanged === true } as ServerSyncState;
}

export async function createHouseholdDevicePairing(token: string, householdId: string) {
  return request<{ code: string; pairing: Record<string, unknown> }>(`/api/households/${encodeURIComponent(householdId)}/pairings`, {
    method: 'POST', body: JSON.stringify({ role: 'household_device' }),
  }, token);
}

export async function claimHouseholdDevice(code: string, name: string, platform: string) {
  const result = await request<{
    deviceToken?: unknown;
    householdId?: unknown;
    device?: { id?: unknown };
  }>('/api/pairings/claim-household-device', {
    method: 'POST', body: JSON.stringify({ code, name, platform }),
  });
  return {
    deviceToken: requiredString(result.deviceToken, 'deviceToken'),
    householdId: requiredString(result.householdId, 'householdId'),
    deviceId: requiredString(result.device?.id, 'device.id'),
  };
}

export async function getMe(token: string) {
  const result = await request<MeResponse>('/api/me', {}, token);
  if (!Array.isArray(result.households)) throw new ApiError('Invalid API response: households', 'server');
  return {
    user: normalizeUser(result.user),
    households: result.households.map((household) => ({
      id: requiredString(household.id, 'household.id'),
      name: requiredString(household.name, 'household.name'),
      timezone: requiredString(household.timezone, 'household.timezone'),
      role: requiredString(household.role, 'household.role') as HouseholdRole,
    })),
  };
}

export async function logoutOnline(token: string) {
  await request('/api/auth/logout', { method: 'POST', body: '{}' }, token);
}

export async function getAccountSessions(token: string): Promise<AccountSession[]> {
  const result = await request<{ sessions?: Array<Record<string, unknown>> }>('/api/me/sessions', {}, token);
  if (!Array.isArray(result.sessions)) throw new ApiError('Invalid API response: sessions', 'server');
  return result.sessions.map((session) => ({
    id: requiredString(session.id, 'session.id'),
    current: session.current === true,
    deviceName: nullableString(session.deviceName),
    platform: nullableString(session.platform),
    createdAt: requiredString(session.createdAt, 'session.createdAt'),
    lastUsedAt: nullableString(session.lastUsedAt),
    expiresAt: requiredString(session.expiresAt, 'session.expiresAt'),
  }));
}

export async function revokeAccountSession(token: string, sessionId: string) {
  return request<{ ok: boolean; current: boolean }>(`/api/me/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  }, token);
}

/**
 * Public release metadata. Deliberately unauthenticated and failure-tolerant: a
 * local-only household has no session, and update discovery must never disrupt play.
 */
export async function fetchAppMeta(): Promise<unknown> {
  try {
    return await request<unknown>('/api/meta');
  } catch {
    return null;
  }
}
