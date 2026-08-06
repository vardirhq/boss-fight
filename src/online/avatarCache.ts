import { recordDiagnostic } from './diagnostics';

const PREFIX = 'boss-kamp-sync-avatars-v1:';

export type AvatarRow = Record<string, unknown>;

export function loadAvatarCache(householdId: string): AvatarRow[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${PREFIX}${householdId}`) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function knownAvatarHashes(rows: AvatarRow[]) {
  return Object.fromEntries(rows.flatMap((row) => (
    typeof row.fighter_id === 'string' && typeof row.hash === 'string'
      ? [[row.fighter_id, row.hash]]
      : []
  ))) as Record<string, string>;
}

export function mergeAvatarCache(fighters: AvatarRow[], current: AvatarRow[], incoming: AvatarRow[]) {
  const cached = new Map(current.map((row) => [String(row.fighter_id), row]));
  const received = new Map(incoming.map((row) => [String(row.fighter_id), row]));
  return fighters.flatMap((fighter) => {
    const fighterId = String(fighter.id);
    const expectedHash = typeof fighter.avatar_hash === 'string' ? fighter.avatar_hash : null;
    if (!expectedHash) return [];
    const next = received.get(fighterId);
    if (next?.hash === expectedHash) return [next];
    const previous = cached.get(fighterId);
    return previous?.hash === expectedHash ? [previous] : [];
  });
}

export function saveAvatarCache(householdId: string, rows: AvatarRow[]) {
  try {
    localStorage.setItem(`${PREFIX}${householdId}`, JSON.stringify(rows));
    return true;
  } catch (error) {
    // Avatar bytes are the largest thing this origin stores, so a quota failure here
    // is the first symptom of storage pressure. Report it instead of silently
    // refetching every avatar on every pull.
    recordDiagnostic({
      area: 'storage', operation: 'avatar-cache', outcome: 'error',
      code: error instanceof Error ? error.name : 'write_failed',
    });
    return false;
  }
}

export function clearAvatarCache(householdId: string) {
  localStorage.removeItem(`${PREFIX}${householdId}`);
}
