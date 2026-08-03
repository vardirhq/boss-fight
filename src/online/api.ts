const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
  ?? 'https://boss-kamp.vardir.no';

export type HouseholdRole = 'owner' | 'parent' | 'member' | 'child';

export interface OnlineUser {
  id: string;
  email: string | null;
  displayName: string;
  kind: 'adult' | 'child';
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

export type ApiErrorKind = 'network' | 'unauthenticated' | 'forbidden' | 'conflict' | 'validation' | 'server' | 'unknown';

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

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : 'Network unavailable', 'network');
  }

  const payload = await response.json().catch(() => ({})) as { error?: unknown; code?: unknown };
  if (!response.ok) {
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

export async function loginChild(householdId: string, fighterId: string, pin: string, deviceName: string, platform: string) {
  return normalizeAuth(await request<AuthResponse>('/api/auth/child-login', {
    method: 'POST',
    body: JSON.stringify({ householdId, fighterId, pin, deviceName, platform }),
  }));
}

export async function bootstrapHousehold(token: string, householdName: string) {
  const result = await request<{ householdId?: unknown; created?: unknown }>('/api/bootstrap', {
    method: 'POST',
    body: JSON.stringify({ householdName, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Oslo' }),
  }, token);
  return {
    householdId: requiredString(result.householdId, 'householdId'),
    created: result.created !== false,
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
