const MINUTE_MS = 60 * 1000;

/**
 * Per-IP limits for the adult credential routes.
 *
 * The global limit alone allows hundreds of password guesses a minute against
 * `scrypt` hashes, and lets registration be used to send verification mail to an
 * arbitrary address in bulk. Child authentication has carried a route limit since the
 * pairing-lockout work; the adult routes are the more valuable target and had none.
 */
export const adultLoginRateLimit = {
  max: Number(process.env.ADULT_LOGIN_RATE_LIMIT_MAX ?? 20),
  timeWindow: process.env.ADULT_LOGIN_RATE_LIMIT_WINDOW ?? '10 minutes',
};

export const registrationRateLimit = {
  max: Number(process.env.REGISTRATION_RATE_LIMIT_MAX ?? 5),
  timeWindow: process.env.REGISTRATION_RATE_LIMIT_WINDOW ?? '1 hour',
};

export type LoginLockoutPolicy = {
  /** Consecutive failures before the account stops accepting passwords. */
  threshold: number;
  /** How long a locked account stays locked. */
  lockMinutes: number;
};

export const DEFAULT_LOGIN_LOCKOUT_POLICY: LoginLockoutPolicy = {
  threshold: 10,
  lockMinutes: 15,
};

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function loginLockoutPolicy(env: NodeJS.ProcessEnv = process.env): LoginLockoutPolicy {
  return {
    threshold: positiveInteger(env.LOGIN_LOCKOUT_THRESHOLD, DEFAULT_LOGIN_LOCKOUT_POLICY.threshold, 'LOGIN_LOCKOUT_THRESHOLD'),
    lockMinutes: positiveInteger(env.LOGIN_LOCKOUT_MINUTES, DEFAULT_LOGIN_LOCKOUT_POLICY.lockMinutes, 'LOGIN_LOCKOUT_MINUTES'),
  };
}

export function loginLocked(lockedUntil: unknown, now = new Date()) {
  if (lockedUntil === null || lockedUntil === undefined) return false;
  const until = lockedUntil instanceof Date ? lockedUntil : new Date(String(lockedUntil));
  return !Number.isNaN(until.getTime()) && until > now;
}

/**
 * The lock applied after a failed attempt, or null while below the threshold.
 *
 * A short, self-clearing lock is deliberate. It removes the value of sustained
 * guessing without handing an attacker a way to keep a household's parent locked out
 * indefinitely, which a permanent lock would.
 */
export function loginLockoutUntil(
  failedAttempts: number,
  now = new Date(),
  policy = DEFAULT_LOGIN_LOCKOUT_POLICY,
): Date | null {
  if (failedAttempts < policy.threshold) return null;
  return new Date(now.getTime() + policy.lockMinutes * MINUTE_MS);
}
