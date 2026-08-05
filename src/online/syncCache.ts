import type { ServerSyncState, SyncCursors } from './api';

const PREFIX = 'boss-kamp-sync-events-v1:';
const streams = ['chore_completions', 'boss_resets', 'boss_victories', 'wallet_transactions', 'reward_redemptions'] as const;

export type SyncEventCache = ServerSyncState['events'];

export const emptySyncEventCache = (): SyncEventCache => ({
  chore_completions: [], boss_resets: [], boss_victories: [], wallet_transactions: [], reward_redemptions: [],
});

export function loadSyncEventCache(householdId: string): SyncEventCache {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${PREFIX}${householdId}`) ?? '{}') as Partial<SyncEventCache>;
    return Object.fromEntries(streams.map((stream) => [stream, Array.isArray(parsed[stream]) ? parsed[stream] : []])) as unknown as SyncEventCache;
  } catch { return emptySyncEventCache(); }
}

export function mergeSyncEvents(current: SyncEventCache, incoming: SyncEventCache): SyncEventCache {
  return Object.fromEntries(streams.map((stream) => {
    const rows = new Map<string, Record<string, unknown>>();
    for (const row of [...current[stream], ...incoming[stream]]) {
      if (typeof row.id === 'string') rows.set(row.id, row);
    }
    return [stream, [...rows.values()].sort((a, b) => Number(a.server_seq ?? 0) - Number(b.server_seq ?? 0))];
  })) as unknown as SyncEventCache;
}

export function syncCursors(events: SyncEventCache): SyncCursors {
  const maximum = (stream: keyof SyncEventCache) => events[stream].reduce((max, row) => Math.max(max, Number(row.server_seq ?? 0)), 0);
  return {
    chore_completions: maximum('chore_completions'),
    boss_resets: maximum('boss_resets'),
    boss_victories: maximum('boss_victories'),
    wallet_transactions: maximum('wallet_transactions'),
    // Redemption rows can change status without receiving a new sequence yet.
    reward_redemptions: 0,
  };
}

export function saveSyncEventCache(householdId: string, events: SyncEventCache) {
  try { localStorage.setItem(`${PREFIX}${householdId}`, JSON.stringify(events)); } catch { /* Refetch safely next time. */ }
}

export function clearSyncEventCache(householdId: string) {
  localStorage.removeItem(`${PREFIX}${householdId}`);
}
