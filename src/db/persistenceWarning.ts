import type { PersistenceStatus } from './sqlite';

/**
 * OPFS is unavailable in the Android WebView by design. The SQLite fallback is
 * therefore the normal native storage path, not an actionable browser warning.
 * Actual restore and write failures must still be surfaced on every platform.
 */
export function shouldShowPersistenceWarning(
  status: PersistenceStatus,
  isNativePlatform: boolean,
): boolean {
  return status.issue !== null
    && !(isNativePlatform && status.issue === 'opfs-unavailable');
}
