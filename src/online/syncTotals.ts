import { dayKey, recordActiveDay } from '../game/logic';
import type { ServerSyncState, SyncCursors, SyncTotals } from './api';

export type SyncEvents = ServerSyncState['events'];
export type SyncStream = keyof SyncEvents;

export const syncStreams = [
  'chore_completions', 'boss_resets', 'boss_victories',
  'wallet_transactions', 'reward_redemptions',
] as const;

/**
 * Rows kept in durable storage per stream after their contribution has been folded
 * into the totals.
 *
 * The projection only ever reads raw rows for the *current* cycle of each boss (HP,
 * used chores, victory state, and the battle log). Everything that needs the whole
 * history — wallet balances, career XP, victory counts — is a running total, so a
 * bounded recent tail is sufficient and the cache stops growing with playtime.
 */
export const retainedEvents: Record<SyncStream, number> = {
  chore_completions: 400,
  boss_resets: 150,
  boss_victories: 150,
  wallet_transactions: 150,
  reward_redemptions: 60,
};

export const emptySyncEvents = (): SyncEvents => ({
  chore_completions: [], boss_resets: [], boss_victories: [],
  wallet_transactions: [], reward_redemptions: [],
});

export const emptySyncCursors = (): SyncCursors => ({
  chore_completions: 0, boss_resets: 0, boss_victories: 0,
  wallet_transactions: 0, reward_redemptions: 0,
});

export const emptySyncTotals = (): SyncTotals => ({
  cursors: emptySyncCursors(), coins: {}, pool: 0, careerXp: {}, activeDays: {},
  victories: 0, rareVictory: false,
});

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function booleanValue(value: unknown) {
  return value === true || value === 1 || value === '1';
}

function sequence(row: Record<string, unknown>) {
  return numberValue(row.server_seq);
}

function foldRow(totals: SyncTotals, stream: SyncStream, row: Record<string, unknown>) {
  if (stream === 'chore_completions') {
    if (row.voided_at) return;
    const fighterId = stringValue(row.fighter_id);
    totals.careerXp[fighterId] = (totals.careerXp[fighterId] ?? 0) + numberValue(row.damage);
    // The day a chore was completed, in this device's local calendar, is what a streak
    // counts. Folding it here keeps streaks intact once raw rows are pruned.
    const completedAt = new Date(stringValue(row.completed_at));
    if (!Number.isNaN(completedAt.getTime())) {
      totals.activeDays[fighterId] = recordActiveDay(totals.activeDays[fighterId], dayKey(completedAt));
    }
    return;
  }
  if (stream === 'wallet_transactions') {
    if (row.fighter_id == null) {
      totals.pool += numberValue(row.amount);
      return;
    }
    const fighterId = stringValue(row.fighter_id);
    totals.coins[fighterId] = (totals.coins[fighterId] ?? 0) + numberValue(row.amount);
    return;
  }
  if (stream === 'boss_victories') {
    totals.victories += 1;
    if (booleanValue(row.rare)) totals.rareVictory = true;
  }
}

/**
 * Fold incoming rows into running totals.
 *
 * Rows at or below the recorded cursor are skipped so a re-delivered page — a
 * paginated drain, a retry, or a redemption re-emitted with a fresh sequence — can
 * never be counted twice. Passing `incremental: false` folds every row regardless of
 * sequence, which is how a bare event list (a legacy cache, or a test fixture) is
 * converted into totals.
 */
export function accumulateSyncTotals(
  totals: SyncTotals,
  incoming: SyncEvents,
  incremental = true,
): SyncTotals {
  const next: SyncTotals = {
    cursors: { ...totals.cursors },
    coins: { ...totals.coins },
    pool: totals.pool,
    careerXp: { ...totals.careerXp },
    activeDays: Object.fromEntries(Object.entries(totals.activeDays ?? {}).map(([id, days]) => [id, [...days]])),
    victories: totals.victories,
    rareVictory: totals.rareVictory,
  };
  for (const stream of syncStreams) {
    const consumed = totals.cursors[stream];
    let highest = consumed;
    for (const row of incoming[stream] ?? []) {
      const seq = sequence(row);
      if (seq > highest) highest = seq;
      if (incremental && seq <= consumed) continue;
      foldRow(next, stream, row);
    }
    next.cursors[stream] = highest;
  }
  return next;
}

/** Totals for an event list that carries no cursor state of its own. */
export function syncTotalsFromEvents(events: SyncEvents): SyncTotals {
  return accumulateSyncTotals(emptySyncTotals(), events, false);
}

/** Merge by identity, newest wins, then keep only the recent tail of each stream. */
export function pruneSyncEvents(current: SyncEvents, incoming: SyncEvents): SyncEvents {
  return Object.fromEntries(syncStreams.map((stream) => {
    const rows = new Map<string, Record<string, unknown>>();
    for (const row of [...(current[stream] ?? []), ...(incoming[stream] ?? [])]) {
      if (typeof row.id === 'string') rows.set(row.id, row);
    }
    const ordered = [...rows.values()].sort((a, b) => sequence(a) - sequence(b));
    return [stream, ordered.slice(-retainedEvents[stream])];
  })) as unknown as SyncEvents;
}
