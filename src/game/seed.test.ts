import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_LAUNDRY_BOSS_NAME,
  REWARDS_GROUP,
  REWARDS_PERSONAL,
  SPRITE,
  eliteSpriteFor,
  extraSeedBosses,
  remapBossName,
  remapSprite,
  rewardsFor,
  seedBosses,
  sumDamage,
} from './seed.ts';

test('seed bosses have unique identifiers and derived combat values', () => {
  const bosses = seedBosses();
  assert.equal(new Set(bosses.map(({ id }) => id)).size, bosses.length);
  const choreIds = bosses.flatMap(({ chores }) => chores.map(({ id }) => id));
  assert.equal(new Set(choreIds).size, choreIds.length);
  for (const boss of bosses) {
    assert.equal(boss.hp, sumDamage(boss.chores));
    assert.ok(boss.chores.length > 0);
    assert.equal(boss.chores.filter(({ repeatable }) => repeatable).length, 1);
    assert.equal(boss.chores[0].repeatable, true);
  }
});

test('migration seed bosses are included exactly once in fresh installs', () => {
  const allIds = seedBosses().map(({ id }) => id);
  for (const { id } of extraSeedBosses()) assert.equal(allIds.filter((candidate) => candidate === id).length, 1);
});

test('legacy artwork and default names migrate without changing custom values', () => {
  assert.equal(remapSprite('/uploads/dish-hydra-boss-transparent.png'), SPRITE.dishes);
  assert.equal(remapSprite('/custom/boss.webp'), '/custom/boss.webp');
  assert.equal(remapBossName('Vaskedragen', SPRITE.laundry), DEFAULT_LAUNDRY_BOSS_NAME);
  assert.equal(remapBossName('Min drage', SPRITE.laundry), 'Min drage');
  assert.equal(eliteSpriteFor({ sprite: SPRITE.laundry }), SPRITE.laundryElite);
});

test('reward catalogs have unique ids and positive integer prices', () => {
  const rewards = [...REWARDS_PERSONAL, ...REWARDS_GROUP];
  assert.equal(new Set(rewards.map(({ id }) => id)).size, rewards.length);
  for (const reward of rewards) assert.ok(Number.isInteger(reward.cost) && reward.cost > 0);
});

test('English reward catalogs preserve ids and prices without Norwegian copy', () => {
  const norwegian = [...rewardsFor('no').personal, ...rewardsFor('no').group];
  const english = [...rewardsFor('en').personal, ...rewardsFor('en').group];
  assert.deepEqual(english.map(({ id, cost }) => ({ id, cost })), norwegian.map(({ id, cost }) => ({ id, cost })));
  for (const reward of english) {
    assert.doesNotMatch(`${reward.title} ${reward.desc}`, /[æøåÆØÅ]|\b(og|familien|velg|bruk|kveld)\b/i);
  }
});
