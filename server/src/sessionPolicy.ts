const DAY_MS = 24 * 60 * 60 * 1000;

export type SessionPolicy = {
  absoluteDays: number;
  idleDays: number;
};

export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  absoluteDays: 90,
  idleDays: 30,
};

function positiveDays(value: string | undefined, fallback: number, name: string) {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function sessionPolicy(env: NodeJS.ProcessEnv = process.env): SessionPolicy {
  const policy = {
    absoluteDays: positiveDays(env.SESSION_DAYS, DEFAULT_SESSION_POLICY.absoluteDays, 'SESSION_DAYS'),
    idleDays: positiveDays(env.SESSION_IDLE_DAYS, DEFAULT_SESSION_POLICY.idleDays, 'SESSION_IDLE_DAYS'),
  };
  if (policy.idleDays > policy.absoluteDays) {
    throw new Error('SESSION_IDLE_DAYS cannot exceed SESSION_DAYS');
  }
  return policy;
}

export function sessionExpiry(now = new Date(), policy = DEFAULT_SESSION_POLICY) {
  return new Date(now.getTime() + policy.absoluteDays * DAY_MS);
}

export function sessionIdleCutoff(now = new Date(), policy = DEFAULT_SESSION_POLICY) {
  return new Date(now.getTime() - policy.idleDays * DAY_MS);
}
