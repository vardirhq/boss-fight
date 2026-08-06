import assert from 'node:assert/strict';
import test from 'node:test';
import { emptySyncEventCache, foldSyncCache, emptySyncCache, syncCursors, syncHasMore } from './syncCache';
import { retainedEvents, syncTotalsFromEvents } from './syncTotals';
import { dayKey } from '../game/logic.ts';

test('folded pages advance independent cursors and accumulate running totals', () => {
  const first = emptySyncEventCache();
  first.chore_completions = [{ id: 'a', server_seq: 2, fighter_id: 'f1', damage: 10 }];
  first.wallet_transactions = [{ id: 'w1', server_seq: 9, fighter_id: 'f1', amount: 5 }];
  const afterFirst = foldSyncCache(emptySyncCache(), first);

  const second = emptySyncEventCache();
  second.chore_completions = [{ id: 'b', server_seq: 5, fighter_id: 'f1', damage: 12 }];
  second.wallet_transactions = [{ id: 'w2', server_seq: 11, fighter_id: null, amount: 6 }];
  second.boss_victories = [{ id: 'v1', server_seq: 3, rare: 1 }];
  const merged = foldSyncCache(afterFirst, second);

  assert.deepEqual(merged.events.chore_completions.map((row) => row.id), ['a', 'b']);
  assert.deepEqual(syncCursors(merged), {
    chore_completions: 5, boss_resets: 0, boss_victories: 3, wallet_transactions: 11, reward_redemptions: 0,
  });
  assert.equal(merged.totals.careerXp.f1, 22);
  assert.equal(merged.totals.coins.f1, 5);
  assert.equal(merged.totals.pool, 6);
  assert.equal(merged.totals.victories, 1);
  assert.equal(merged.totals.rareVictory, true);
});

test('re-delivered rows at or below the cursor are never counted twice', () => {
  const page = emptySyncEventCache();
  page.chore_completions = [{ id: 'a', server_seq: 2, fighter_id: 'f1', damage: 10 }];
  page.wallet_transactions = [{ id: 'w1', server_seq: 4, fighter_id: 'f1', amount: 7 }];
  page.boss_victories = [{ id: 'v1', server_seq: 1, rare: 0 }];

  const once = foldSyncCache(emptySyncCache(), page);
  const twice = foldSyncCache(once, page);

  assert.equal(twice.totals.careerXp.f1, 10);
  assert.equal(twice.totals.coins.f1, 7);
  assert.equal(twice.totals.victories, 1);
});

test('voided completions contribute no career xp', () => {
  const page = emptySyncEventCache();
  page.chore_completions = [
    { id: 'a', server_seq: 1, fighter_id: 'f1', damage: 10 },
    { id: 'b', server_seq: 2, fighter_id: 'f1', damage: 20, voided_at: 'now' },
  ];
  assert.equal(foldSyncCache(emptySyncCache(), page).totals.careerXp.f1, 10);
});

test('retained rows stay bounded while totals keep the full history', () => {
  const limit = retainedEvents.chore_completions;
  let cache = emptySyncCache();
  for (let batch = 0; batch < 4; batch += 1) {
    const page = emptySyncEventCache();
    page.chore_completions = Array.from({ length: limit }, (_, index) => ({
      id: `c${batch}-${index}`, server_seq: batch * limit + index + 1, fighter_id: 'f1', damage: 1,
    }));
    cache = foldSyncCache(cache, page);
  }

  assert.equal(cache.events.chore_completions.length, limit);
  // Totals span every batch even though only the last page of rows survives.
  assert.equal(cache.totals.careerXp.f1, limit * 4);
  assert.equal(cache.totals.cursors.chore_completions, limit * 4);
  // The retained tail is the newest slice, which is what the current cycle needs.
  assert.equal(cache.events.chore_completions[0].id, `c3-0`);
});

test('totals derived from a bare event list ignore sequence gating', () => {
  const events = emptySyncEventCache();
  events.chore_completions = [{ id: 'a', fighter_id: 'f1', damage: 30 }];
  events.wallet_transactions = [{ id: 'w', fighter_id: null, amount: 4 }];
  const totals = syncTotalsFromEvents(events);
  assert.equal(totals.careerXp.f1, 30);
  assert.equal(totals.pool, 4);
});

test('pagination continues while any independent event stream has more rows', () => {
  const eventHasMore = {
    chore_completions: false, boss_resets: false, boss_victories: true,
    wallet_transactions: false, reward_redemptions: false,
  };
  assert.equal(syncHasMore({ eventHasMore } as never), true);
  eventHasMore.boss_victories = false;
  assert.equal(syncHasMore({ eventHasMore } as never), false);
});

test('completion days fold into totals so streaks outlive the pruned event tail', () => {
  const page = emptySyncEventCache();
  page.chore_completions = [
    { id: 'a', server_seq: 1, fighter_id: 'f1', damage: 10, completed_at: '2026-08-05T09:00:00Z' },
    { id: 'b', server_seq: 2, fighter_id: 'f1', damage: 10, completed_at: '2026-08-05T18:00:00Z' },
    { id: 'c', server_seq: 3, fighter_id: 'f2', damage: 10, completed_at: '2026-08-06T08:00:00Z' },
    { id: 'd', server_seq: 4, fighter_id: 'f1', damage: 10, voided_at: 'now', completed_at: '2026-08-07T08:00:00Z' },
    { id: 'e', server_seq: 5, fighter_id: 'f1', damage: 10, completed_at: 'not a timestamp' },
  ];
  const cache = foldSyncCache(emptySyncCache(), page);
  // Two chores on one day count as one day; a voided or unparseable row contributes none.
  assert.deepEqual(cache.totals.activeDays.f1, [dayKey(new Date('2026-08-05T09:00:00Z'))]);
  assert.deepEqual(cache.totals.activeDays.f2, [dayKey(new Date('2026-08-06T08:00:00Z'))]);
});

test('a re-delivered page does not extend the day record twice', () => {
  const page = emptySyncEventCache();
  page.chore_completions = [{ id: 'a', server_seq: 1, fighter_id: 'f1', damage: 10, completed_at: '2026-08-05T09:00:00Z' }];
  const twice = foldSyncCache(foldSyncCache(emptySyncCache(), page), page);
  assert.equal(twice.totals.activeDays.f1.length, 1);
});
