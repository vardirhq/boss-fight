export const PRIVACY_NOTICE_VERSION = '2026-08-05';

export const householdExportFields = {
  household: ['id', 'name', 'timezone', 'victories_baseline', 'created_at', 'updated_at'],
  members: ['id', 'user_id', 'kind', 'display_name', 'email', 'role', 'status', 'joined_at', 'updated_at'],
  childAuthorizations: ['id', 'child_user_id', 'authorized_by_user_id', 'privacy_notice_version', 'authorized_at'],
  devices: ['id', 'user_id', 'kind', 'name', 'platform', 'last_seen_at', 'revoked_at', 'created_at'],
  fighters: ['id', 'user_id', 'name', 'color', 'avatar_hash', 'streak', 'coins_cached', 'career_xp_cached', 'sort', 'created_at', 'updated_at', 'deleted_at'],
  fighterAvatars: ['fighter_id', 'mime', 'bytes_base64', 'hash', 'updated_at'],
  invites: ['id', 'invited_email', 'role', 'fighter_id', 'created_by_user_id', 'expires_at', 'accepted_at', 'accepted_by_user_id', 'created_at'],
  pairings: ['id', 'fighter_id', 'role', 'created_by_user_id', 'expires_at', 'claimed_at', 'claimed_device_id', 'created_at'],
  bosses: ['id', 'name', 'sprite', 'frames', 'rare', 'hue', 'trigger_type', 'trigger_day', 'trigger_date', 'trigger_note', 'dormant', 'unlock_at', 'sort', 'created_at', 'updated_at', 'deleted_at'],
  chores: ['id', 'boss_id', 'title', 'damage', 'repeatable', 'sort', 'created_at', 'updated_at', 'deleted_at'],
  rewards: ['id', 'scope', 'icon', 'title', 'descr', 'cost', 'sort', 'created_at', 'updated_at', 'deleted_at'],
  choreCompletions: ['id', 'boss_id', 'chore_id', 'fighter_id', 'cycle_key', 'reset_seq', 'chore_title', 'damage', 'performed_by_user_id', 'performed_by_device_id', 'acted_on_behalf', 'completed_at', 'voided_at', 'voided_by_user_id', 'created_at'],
  bossResets: ['id', 'boss_id', 'cycle_key', 'reset_seq', 'reason', 'created_by_user_id', 'created_at'],
  bossVictories: ['id', 'boss_id', 'cycle_key', 'reset_seq', 'elite', 'rare', 'won_at', 'created_at'],
  walletTransactions: ['id', 'fighter_id', 'amount', 'kind', 'transfer_group', 'reference_type', 'reference_id', 'note', 'created_by_user_id', 'created_at'],
  rewardRedemptions: ['id', 'reward_id', 'scope', 'fighter_id', 'icon', 'title', 'cost', 'status', 'requested_by_user_id', 'approved_by_user_id', 'used_at', 'created_at', 'updated_at'],
} as const;

export type HouseholdExportSection = keyof typeof householdExportFields;

/** Defense-in-depth response projection: credentials and unknown DB fields never leave the API. */
export function privacyExportRows(section: HouseholdExportSection, rows: Array<Record<string, unknown>>) {
  const fields = householdExportFields[section] as readonly string[];
  return rows.map((row) => Object.fromEntries(
    fields.filter((field) => field in row).map((field) => [field, row[field]]),
  ));
}

export function assertChildErasureTarget(input: {
  userId: unknown;
  userKind: unknown;
  role: unknown;
}) {
  if (typeof input.userId !== 'string' || input.userKind !== 'child' || input.role !== 'child') {
    throw new Error('Only child identities can be erased through this route');
  }
  return input.userId;
}
