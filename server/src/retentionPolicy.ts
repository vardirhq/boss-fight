const DAY_MS = 24 * 60 * 60 * 1000;

export type RetentionPolicy = {
  invitesDays: number;
  pairingsDays: number;
  sessionsDays: number;
  passwordResetsDays: number;
  devicesDays: number;
  deletedAvatarsDays: number;
};

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  invitesDays: 30,
  pairingsDays: 7,
  sessionsDays: 30,
  passwordResetsDays: 30,
  devicesDays: 30,
  deletedAvatarsDays: 30,
};

function positiveDays(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error('Retention days must be a positive integer');
  return parsed;
}

export function retentionPolicy(env: NodeJS.ProcessEnv = process.env): RetentionPolicy {
  return {
    invitesDays: positiveDays(env.RETENTION_INVITES_DAYS, DEFAULT_RETENTION_POLICY.invitesDays),
    pairingsDays: positiveDays(env.RETENTION_PAIRINGS_DAYS, DEFAULT_RETENTION_POLICY.pairingsDays),
    sessionsDays: positiveDays(env.RETENTION_SESSIONS_DAYS, DEFAULT_RETENTION_POLICY.sessionsDays),
    passwordResetsDays: positiveDays(env.RETENTION_PASSWORD_RESETS_DAYS, DEFAULT_RETENTION_POLICY.passwordResetsDays),
    devicesDays: positiveDays(env.RETENTION_REVOKED_DEVICES_DAYS, DEFAULT_RETENTION_POLICY.devicesDays),
    deletedAvatarsDays: positiveDays(env.RETENTION_DELETED_AVATARS_DAYS, DEFAULT_RETENTION_POLICY.deletedAvatarsDays),
  };
}

export function retentionCutoffs(now: Date, policy = DEFAULT_RETENTION_POLICY) {
  const cutoff = (days: number) => new Date(now.getTime() - days * DAY_MS);
  return {
    invites: cutoff(policy.invitesDays),
    pairings: cutoff(policy.pairingsDays),
    sessions: cutoff(policy.sessionsDays),
    passwordResets: cutoff(policy.passwordResetsDays),
    devices: cutoff(policy.devicesDays),
    deletedAvatars: cutoff(policy.deletedAvatarsDays),
  };
}
