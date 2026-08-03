const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
  ?? 'https://boss-kamp.vardir.no';

const SESSION_KEY = 'boss-kamp-online-session-v1';

export interface OnlineSession {
  token: string;
  expiresAt: string;
  user: {
    id: string;
    email?: string | null;
    displayName: string;
    kind?: 'adult' | 'child';
  };
  householdId?: string;
}

export function loadOnlineSession(): OnlineSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as OnlineSession;
    if (!session.token || !session.user?.id) return null;
    if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveOnlineSession(session: OnlineSession | null) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload as T;
}

interface AuthResponse {
  user: { id: string; email?: string | null; display_name?: string; displayName?: string; kind?: 'adult' | 'child' };
  session: { token: string; expiresAt?: string; expires_at?: string };
}

function normalizeAuth(result: AuthResponse): OnlineSession {
  return {
    token: result.session.token,
    expiresAt: result.session.expiresAt ?? result.session.expires_at ?? '',
    user: {
      id: result.user.id,
      email: result.user.email,
      displayName: result.user.displayName ?? result.user.display_name ?? '',
      kind: result.user.kind,
    },
  };
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

export async function bootstrapHousehold(token: string, householdName: string) {
  return request<{ householdId: string }>('/api/bootstrap', {
    method: 'POST',
    body: JSON.stringify({ householdName, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Oslo' }),
  }, token);
}

export async function getMe(token: string) {
  return request<{ user: OnlineSession['user']; households: Array<{ id: string; name: string; role: string }> }>('/api/me', {}, token);
}

export async function logoutOnline(token: string) {
  await request('/api/auth/logout', { method: 'POST', body: '{}' }, token);
}
