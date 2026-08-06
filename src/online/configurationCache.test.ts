import assert from 'node:assert/strict';
import test from 'node:test';
import type { ServerSyncState } from './api';
import { mergeConfigurationCache } from './configurationCache';

const emptySync = (revision: number): ServerSyncState => ({
  serverTime: '2026-08-06T00:00:00Z', configurationRevision: revision, configurationUnchanged: true,
  mutable: { households: [], fighters: [], fighter_avatars: [], bosses: [], chores: [] },
  events: { chore_completions: [], boss_resets: [], boss_victories: [], wallet_transactions: [], reward_redemptions: [] },
});

test('unchanged synchronization reuses only an exact-revision configuration cache', () => {
  const mutable = { households: [{ id: 'household' }], fighters: [], fighter_avatars: [], bosses: [], chores: [] };
  assert.equal(mergeConfigurationCache(emptySync(4), { revision: 4, mutable }).mutable, mutable);
  assert.throws(() => mergeConfigurationCache(emptySync(4), { revision: 3, mutable }), /Missing synchronized configuration cache/);
  assert.throws(() => mergeConfigurationCache(emptySync(4), null), /Missing synchronized configuration cache/);
});
