import type { ServerSyncState } from './api';

const PREFIX = 'boss-kamp-sync-configuration-v1:';

export interface ConfigurationCache {
  revision: number;
  mutable: ServerSyncState['mutable'];
}

export function loadConfigurationCache(householdId: string): ConfigurationCache | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${PREFIX}${householdId}`) ?? 'null') as Partial<ConfigurationCache> | null;
    if (!parsed || !Number.isSafeInteger(parsed.revision) || Number(parsed.revision) < 0 || !parsed.mutable) return null;
    const mutable = parsed.mutable;
    if (![mutable.households, mutable.fighters, mutable.fighter_avatars, mutable.bosses, mutable.chores].every(Array.isArray)) return null;
    return { revision: Number(parsed.revision), mutable };
  } catch { return null; }
}

export function mergeConfigurationCache(incoming: ServerSyncState, cached: ConfigurationCache | null): ServerSyncState {
  if (!incoming.configurationUnchanged) return incoming;
  if (!cached || cached.revision !== incoming.configurationRevision) {
    throw new Error('Missing synchronized configuration cache');
  }
  return { ...incoming, mutable: cached.mutable };
}

export function saveConfigurationCache(householdId: string, sync: ServerSyncState) {
  try {
    localStorage.setItem(`${PREFIX}${householdId}`, JSON.stringify({
      revision: sync.configurationRevision,
      mutable: sync.mutable,
    } satisfies ConfigurationCache));
  } catch { /* Refetch the complete configuration next time. */ }
}

export function clearConfigurationCache(householdId: string) {
  localStorage.removeItem(`${PREFIX}${householdId}`);
}
