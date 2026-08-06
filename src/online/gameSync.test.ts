import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameState } from '../game/types.ts';
import type { ServerHouseholdConfig, ServerSyncState } from './api.ts';
import { createBootstrapSnapshot, serverConfigToGameState, serverSyncToGameState } from './gameSync.ts';

function game(): GameState {
  return {
    bosses: [{
      id: 'boss-1', name: 'Boss', sprite: '/boss.webp', frames: 0, rare: false,
      trigger: { type: 'daglig' },
      chores: [
        { id: 'chore-1', title: 'First', damage: 10, repeatable: true },
        { id: 'chore-2', title: 'Second', damage: 20, repeatable: false },
      ],
      hp: 30, clearedCycle: '', usedChores: [], dormant: false, unlockAt: 0,
      currentCycleKey: 'cycle-1',
    }],
    fighters: [
      { id: 'fighter-1', name: '  Ada  ', color: '#fff', streak: 2, coins: 9, careerXp: 11, userId: 'user-1', userKind: 'adult' },
      { id: 'fighter-2', name: 'Bob', color: '#000', streak: 0, coins: 0, careerXp: 4 },
    ],
    log: [], redemptions: [], settings: { lang: 'en', sound: true, haptics: true, reducedMotion: false },
    activeFighterId: 'fighter-2', currentBossId: 'boss-1', pool: 7, victories: 3,
    goldenRevealed: false, onboarded: true,
  };
}

function configuration(): ServerHouseholdConfig {
  return {
    household: { victories_baseline: 5 },
    fighters: [
      { id: 'deleted', name: 'Deleted', deleted_at: 'now', sort: 0 },
      { id: 'fighter-2', name: 'Bob', color: '#000', sort: 2, coins_cached: 1, career_xp_cached: 4 },
      { id: 'fighter-1', name: 'Ada', color: '#fff', sort: 1, coins_cached: 2, career_xp_cached: 11, user_id: 'user-1', user_kind: 'adult', account_status: 'active', account_role: 'owner' },
    ],
    fighterAvatars: [{ fighter_id: 'fighter-1', mime: 'image/png', bytes_base64: 'AQ==' }],
    bosses: [{ id: 'boss-1', name: 'Boss', sprite: '/boss.webp', frames: 0, rare: 0, trigger_type: 'daglig', sort: 0, current_cycle_key: 'cycle-1', available: 1, elite: 0 }],
    chores: [
      { id: 'chore-2', boss_id: 'boss-1', title: 'Second', damage: 20, repeatable: 0, sort: 2 },
      { id: 'chore-1', boss_id: 'boss-1', title: 'First', damage: 10, repeatable: 1, sort: 1 },
      { id: 'deleted-chore', boss_id: 'boss-1', title: 'Deleted', damage: 99, deleted_at: 'now' },
    ],
    rewards: [],
    balances: [{ fighter_id: 'fighter-1', balance: 12 }, { fighter_id: null, balance: 8 }],
  };
}

test('bootstrap snapshots trim names, preserve ownership, and flatten bosses and chores', async () => {
  const snapshot = await createBootstrapSnapshot(game());
  assert.equal(snapshot.ownerFighterClientId, 'fighter-1');
  assert.deepEqual(snapshot.fighters.map(({ name, sort }) => [name, sort]), [['Ada', 0], ['Bob', 1]]);
  assert.deepEqual(snapshot.chores.map(({ clientId, bossClientId, sort }) => [clientId, bossClientId, sort]), [
    ['chore-1', 'boss-1', 0], ['chore-2', 'boss-1', 1],
  ]);
  assert.ok(snapshot.rewards.some(({ scope }) => scope === 'personal'));
  await assert.rejects(createBootstrapSnapshot({ ...game(), fighters: [{ ...game().fighters[0], name: '   ' }] }), /fighter_name_required/);
});

test('server configuration filters deleted rows and applies server balances and identity roles', () => {
  const result = serverConfigToGameState(configuration(), game());
  assert.deepEqual(result.fighters.map(({ id }) => id), ['fighter-1', 'fighter-2']);
  assert.equal(result.fighters[0].coins, 12);
  assert.equal(result.fighters[0].accountRole, 'owner');
  assert.equal(result.fighters[0].avatar, 'data:image/png;base64,AQ==');
  assert.deepEqual(result.bosses[0].chores.map(({ id }) => id), ['chore-2', 'chore-1']);
  assert.equal(result.bosses[0].hp, 30);
  assert.equal(result.pool, 8);
  assert.equal(result.victories, 5);
});

test('event projection uses only the current reset, ignores voided attacks, and derives wallets and victories', () => {
  const config = configuration();
  const sync: ServerSyncState = {
    serverTime: '2026-08-05T12:00:00Z', configurationRevision: 4,
    mutable: {
      households: [config.household], fighters: config.fighters,
      fighter_avatars: config.fighterAvatars, bosses: config.bosses, chores: config.chores,
    },
    events: {
      boss_resets: [{ boss_id: 'boss-1', cycle_key: 'cycle-1', reset_seq: 1 }],
      chore_completions: [
        { boss_id: 'boss-1', cycle_key: 'cycle-1', reset_seq: 0, fighter_id: 'fighter-1', chore_id: 'old', chore_title: 'Old', damage: 30 },
        { boss_id: 'boss-1', cycle_key: 'cycle-1', reset_seq: 1, fighter_id: 'fighter-1', chore_id: 'chore-1', chore_title: 'First', damage: 10 },
        { boss_id: 'boss-1', cycle_key: 'cycle-1', reset_seq: 1, fighter_id: 'fighter-1', chore_id: 'void', chore_title: 'Void', damage: 20, voided_at: 'now' },
      ],
      boss_victories: [{ boss_id: 'boss-1', cycle_key: 'cycle-1', reset_seq: 1, rare: 1 }],
      wallet_transactions: [{ fighter_id: 'fighter-1', amount: 4 }, { fighter_id: 'fighter-1', amount: -1 }, { fighter_id: null, amount: 6 }],
      reward_redemptions: [{ id: 'reward-1', reward_id: 'p_snack', icon: '🍫', title: 'Treat', cost: 3, created_at: '2026-08-05T12:00:00Z', fighter_id: 'fighter-1', status: 'used' }],
    },
  };
  const result = serverSyncToGameState(sync, game());
  assert.equal(result.bosses[0].hp, 20);
  assert.deepEqual(result.bosses[0].usedChores, ['chore-1']);
  assert.equal(result.bosses[0].clearedCycle, 'cycle-1');
  assert.equal(result.fighters[0].coins, 3);
  assert.equal(result.fighters[0].careerXp, 40);
  assert.equal(result.pool, 6);
  assert.equal(result.victories, 6);
  assert.equal(result.goldenRevealed, true);
  assert.deepEqual(result.log.map(({ attack }) => attack), ['First']);
  assert.deepEqual(result.redemptions[0], { vid: 'reward-1', rewardId: 'p_snack', icon: '🍫', title: 'Candy at the store', cost: 3, at: '2026-08-05', who: 'Ada', used: true });
});

function syncWith(fighters: Array<Record<string, unknown>>, events: Partial<ServerSyncState['events']>): ServerSyncState {
  return {
    serverTime: '2026-08-05T12:00:00Z', configurationRevision: 1,
    mutable: {
      households: [{ victories_baseline: 0 }], fighters,
      fighter_avatars: [], bosses: [], chores: [],
    },
    events: {
      chore_completions: [], boss_resets: [], boss_victories: [],
      wallet_transactions: [], reward_redemptions: [], ...events,
    },
  };
}

test('career xp adds replayed damage to the pre-synchronization baseline', () => {
  const fighters = [{ id: 'f1', name: 'Ada', color: '#fff', sort: 0, career_xp_baseline: 5000, career_xp_cached: 5000 }];

  const beforeAnyChore = serverSyncToGameState(syncWith(fighters, {}), game());
  assert.equal(beforeAnyChore.fighters[0].careerXp, 5000);

  // The regression this guards: deriving XP from events alone replaced a lifetime of
  // progress with the damage of the first chore that happened to sync.
  const afterOneChore = serverSyncToGameState(syncWith(
    [{ ...fighters[0], career_xp_cached: 5012 }],
    { chore_completions: [{ id: 'c1', server_seq: 1, fighter_id: 'f1', damage: 12 }] },
  ), game());
  assert.equal(afterOneChore.fighters[0].careerXp, 5012);
});

test('career xp is monotonic across a sequence of syncs and a pruned event tail', () => {
  const fighters = [{ id: 'f1', name: 'Ada', color: '#fff', sort: 0, career_xp_baseline: 5000, career_xp_cached: 5000 }];
  let previous = 0;
  let replayed = 0;
  for (const damage of [12, 30, 8, 25]) {
    replayed += damage;
    // Totals carry the whole history even once the raw rows have aged out of the cache.
    const sync: ServerSyncState = {
      ...syncWith([{ ...fighters[0], career_xp_cached: 5000 + replayed }], {}),
      totals: {
        cursors: { chore_completions: replayed, boss_resets: 0, boss_victories: 0, wallet_transactions: 0, reward_redemptions: 0 },
        coins: {}, pool: 0, careerXp: { f1: replayed }, victories: 0, rareVictory: false,
      },
    };
    const careerXp = serverSyncToGameState(sync, game()).fighters[0].careerXp;
    assert.equal(careerXp, 5000 + replayed);
    assert.ok(careerXp > previous, 'career xp must never regress between syncs');
    previous = careerXp;
  }
});

test('a server without the baseline column still reports lifetime career xp', () => {
  // Transitional: the cached total is authoritative but stale, so it acts as a floor.
  const sync = syncWith(
    [{ id: 'f1', name: 'Ada', color: '#fff', sort: 0, career_xp_cached: 5000 }],
    { chore_completions: [{ id: 'c1', server_seq: 1, fighter_id: 'f1', damage: 12 }] },
  );
  assert.equal(serverSyncToGameState(sync, game()).fighters[0].careerXp, 5000);
});

test('supplied totals replace a re-scan of the retained event tail', () => {
  const sync: ServerSyncState = {
    ...syncWith([{ id: 'f1', name: 'Ada', color: '#fff', sort: 0, career_xp_baseline: 0, career_xp_cached: 0 }], {
      // A retained tail that no longer covers the wallet or victory history.
      chore_completions: [{ id: 'c9', server_seq: 900, fighter_id: 'f1', damage: 5 }],
    }),
    totals: {
      cursors: { chore_completions: 900, boss_resets: 0, boss_victories: 40, wallet_transactions: 700, reward_redemptions: 0 },
      coins: { f1: 140 }, pool: 66, careerXp: { f1: 980 }, victories: 40, rareVictory: true,
    },
  };
  const result = serverSyncToGameState(sync, game());
  assert.equal(result.fighters[0].careerXp, 980);
  assert.equal(result.fighters[0].coins, 140);
  assert.equal(result.pool, 66);
  assert.equal(result.victories, 40);
  assert.equal(result.goldenRevealed, true);
});
