import type { ServerSyncState, SyncCursors, SyncTotals } from './api';
import { recordDiagnostic } from './diagnostics';
import {
  accumulateSyncTotals, emptySyncCursors, emptySyncEvents, emptySyncTotals,
  pruneSyncEvents, syncStreams, type SyncEvents,
} from './syncTotals';

const PREFIX = 'boss-kamp-sync-cache-v2:';
// The v1 cache retained the complete event history and grew without bound.
const LEGACY_PREFIX = 'boss-kamp-sync-events-v1:';

export type SyncEventCache = SyncEvents;

export interface SyncCache {
  totals: SyncTotals;
  events: SyncEventCache;
}

export const emptySyncEventCache = emptySyncEvents;

export const emptySyncCache = (): SyncCache => ({
  totals: emptySyncTotals(), events: emptySyncEvents(),
});

function normalizeEvents(value: unknown): SyncEventCache {
  const parsed = (value ?? {}) as Partial<SyncEventCache>;
  return Object.fromEntries(syncStreams.map((stream) => [
    stream, Array.isArray(parsed[stream]) ? parsed[stream] : [],
  ])) as unknown as SyncEventCache;
}

function normalizeAmounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, amount]) => typeof amount === 'number' && Number.isFinite(amount))) as Record<string, number>;
}

function normalizeDayLists(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, days]) => Array.isArray(days))
    .map(([id, days]) => [id, (days as unknown[]).filter((day): day is string => typeof day === 'string')]));
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeTotals(value: unknown): SyncTotals | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const totals = value as Partial<SyncTotals>;
  const stored = (totals.cursors ?? {}) as Partial<SyncCursors>;
  const cursors = emptySyncCursors();
  for (const stream of syncStreams) {
    const cursor = stored[stream];
    if (typeof cursor !== 'number' || !Number.isSafeInteger(cursor) || cursor < 0) return null;
    cursors[stream] = cursor;
  }
  return {
    cursors,
    coins: normalizeAmounts(totals.coins),
    pool: finiteNumber(totals.pool),
    careerXp: normalizeAmounts(totals.careerXp),
    activeDays: normalizeDayLists(totals.activeDays),
    victories: finiteNumber(totals.victories),
    rareVictory: totals.rareVictory === true,
  };
}

/**
 * Rebuild a compacted cache from a v1 full-history cache.
 *
 * Folding the retained rows preserves the household's balances, career XP, and
 * victory count, so an upgrading install keeps its cursors rather than re-downloading
 * the entire history once.
 */
function upgradeLegacyCache(householdId: string): SyncCache | null {
  let legacy: string | null = null;
  try { legacy = localStorage.getItem(`${LEGACY_PREFIX}${householdId}`); } catch { return null; }
  if (!legacy) return null;
  let cache = emptySyncCache();
  try {
    const events = normalizeEvents(JSON.parse(legacy));
    cache = {
      totals: accumulateSyncTotals(emptySyncTotals(), events, false),
      events: pruneSyncEvents(emptySyncEvents(), events),
    };
  } catch {
    // An unreadable legacy cache is discarded; the next pull refetches from zero.
  }
  try { localStorage.removeItem(`${LEGACY_PREFIX}${householdId}`); } catch { /* Nothing to reclaim. */ }
  saveSyncCache(householdId, cache);
  return cache;
}

export function loadSyncCache(householdId: string): SyncCache {
  try {
    const raw = localStorage.getItem(`${PREFIX}${householdId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as { totals?: unknown; events?: unknown };
      const totals = normalizeTotals(parsed.totals);
      if (totals) return { totals, events: normalizeEvents(parsed.events) };
    }
  } catch {
    // Fall through: a corrupt cache is rebuilt from the server.
  }
  return upgradeLegacyCache(householdId) ?? emptySyncCache();
}

/** Fold a pulled page into the totals, then keep only the recent tail of raw rows. */
export function foldSyncCache(cache: SyncCache, incoming: SyncEventCache): SyncCache {
  return {
    totals: accumulateSyncTotals(cache.totals, incoming),
    events: pruneSyncEvents(cache.events, incoming),
  };
}

export function syncCursors(cache: SyncCache): SyncCursors {
  return cache.totals.cursors;
}

export function syncHasMore(sync: ServerSyncState) {
  return syncStreams.some((stream) => sync.eventHasMore?.[stream] === true);
}

/**
 * A failed write is reported rather than swallowed. Silently losing the cache freezes
 * the cursors, which degrades every later pull into a full re-download — the exact
 * failure mode this cache exists to prevent.
 */
export function saveSyncCache(householdId: string, cache: SyncCache): boolean {
  try {
    localStorage.setItem(`${PREFIX}${householdId}`, JSON.stringify(cache));
    return true;
  } catch (error) {
    recordDiagnostic({
      area: 'storage', operation: 'sync-cache', outcome: 'error',
      code: error instanceof Error ? error.name : 'write_failed',
    });
    return false;
  }
}

export function clearSyncCache(householdId: string) {
  localStorage.removeItem(`${PREFIX}${householdId}`);
  try { localStorage.removeItem(`${LEGACY_PREFIX}${householdId}`); } catch { /* Nothing to reclaim. */ }
}
