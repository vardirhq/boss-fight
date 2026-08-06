export const syncPublicFields = {
  households: ['id', 'name', 'timezone', 'victories_baseline'],
  fighters: [
    'id', 'user_id', 'name', 'color', 'streak', 'coins_cached', 'career_xp_cached',
    'career_xp_baseline', 'sort', 'deleted', 'avatar_hash', 'user_kind',
    'account_status', 'account_role',
  ],
  fighter_avatars: ['fighter_id', 'mime', 'bytes_base64', 'hash'],
  bosses: [
    'id', 'name', 'sprite', 'frames', 'rare', 'hue', 'trigger_type', 'trigger_day',
    'trigger_date', 'trigger_note', 'dormant', 'unlock_at', 'sort', 'deleted',
    'current_cycle_key', 'available', 'elite',
  ],
  chores: ['id', 'boss_id', 'title', 'damage', 'repeatable', 'sort', 'deleted'],
  chore_completions: [
    'id', 'boss_id', 'chore_id', 'fighter_id', 'cycle_key', 'reset_seq',
    'chore_title', 'damage', 'voided_at', 'completed_at', 'server_seq',
  ],
  boss_resets: ['id', 'boss_id', 'cycle_key', 'reset_seq', 'server_seq'],
  boss_victories: ['id', 'boss_id', 'cycle_key', 'reset_seq', 'elite', 'rare', 'server_seq'],
  wallet_transactions: ['id', 'fighter_id', 'amount', 'server_seq'],
  reward_redemptions: ['id', 'reward_id', 'fighter_id', 'icon', 'title', 'cost', 'status', 'created_at', 'server_seq'],
} as const;

export type SyncProjection = keyof typeof syncPublicFields;

/** Final response-boundary allowlist; unknown and internal database fields are discarded. */
export function publicSyncRows(projection: SyncProjection, rows: Array<Record<string, unknown>>) {
  const fields = syncPublicFields[projection] as readonly string[];
  return rows.map((row) => Object.fromEntries(fields.filter((field) => field in row).map((field) => [field, row[field]])));
}
