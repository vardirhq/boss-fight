import assert from 'node:assert/strict';
import test from 'node:test';
import { emptySyncEventCache, mergeSyncEvents, syncCursors, syncHasMore } from './syncCache';

test('incremental events merge by identity and advance independent cursors', () => {
  const current = emptySyncEventCache();
  current.chore_completions = [{ id: 'a', server_seq: 2, damage: 10 }];
  const incoming = emptySyncEventCache();
  incoming.chore_completions = [{ id: 'a', server_seq: 2, damage: 12 }, { id: 'b', server_seq: 5 }];
  incoming.wallet_transactions = [{ id: 'w', server_seq: 9 }];
  incoming.reward_redemptions = [{ id: 'r', server_seq: 7, status: 'used' }];
  const merged = mergeSyncEvents(current, incoming);
  assert.deepEqual(merged.chore_completions.map((row) => row.id), ['a', 'b']);
  assert.equal(merged.chore_completions[0].damage, 12);
  assert.deepEqual(syncCursors(merged), {
    chore_completions: 5, boss_resets: 0, boss_victories: 0, wallet_transactions: 9, reward_redemptions: 7,
  });
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
