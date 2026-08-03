import { maxHpOf } from '../game/logic';
import { REWARDS_GROUP, REWARDS_PERSONAL } from '../game/seed';
import type { Boss, Chore, GameState, TriggerType } from '../game/types';
import type { BootstrapSnapshot, ServerHouseholdConfig } from './api';

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function booleanValue(value: unknown) {
  return value === true || value === 1 || value === '1';
}

async function avatarPayload(dataUrl: string) {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return undefined;
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { mime: match[1], bytesBase64: match[2], hash };
}

export async function createBootstrapSnapshot(game: GameState): Promise<BootstrapSnapshot> {
  const fighters = await Promise.all(game.fighters.map(async (fighter, sort) => ({
    clientId: fighter.id,
    name: fighter.name.trim(),
    color: fighter.color,
    avatar: fighter.avatar ? await avatarPayload(fighter.avatar) : undefined,
    streak: fighter.streak,
    coins: fighter.coins,
    careerXp: fighter.careerXp,
    sort,
  })));

  if (fighters.some((fighter) => !fighter.name)) throw new Error('fighter_name_required');

  return {
    victoriesBaseline: game.victories,
    pool: game.pool,
    fighters,
    bosses: game.bosses.map((boss, sort) => ({
      clientId: boss.id,
      name: boss.name,
      sprite: boss.sprite,
      frames: boss.frames,
      rare: boss.rare,
      hue: boss.hue,
      trigger: boss.trigger,
      dormant: boss.dormant,
      unlockAt: boss.unlockAt,
      sort,
    })),
    chores: game.bosses.flatMap((boss) => boss.chores.map((chore, sort) => ({
      clientId: chore.id,
      bossClientId: boss.id,
      title: chore.title,
      damage: chore.damage,
      repeatable: chore.repeatable,
      sort,
    }))),
    rewards: [
      ...REWARDS_PERSONAL.map((reward, sort) => ({ clientId: reward.id, scope: 'personal' as const, icon: reward.icon, title: reward.title, description: reward.desc, cost: reward.cost, sort })),
      ...REWARDS_GROUP.map((reward, sort) => ({ clientId: reward.id, scope: 'group' as const, icon: reward.icon, title: reward.title, description: reward.desc, cost: reward.cost, sort })),
    ],
  };
}

export function serverConfigToGameState(config: ServerHouseholdConfig, current: GameState): GameState {
  const avatars = new Map(config.fighterAvatars.map((avatar) => [
    stringValue(avatar.fighter_id),
    `data:${stringValue(avatar.mime, 'image/png')};base64,${stringValue(avatar.bytes_base64)}`,
  ]));
  const balances = new Map(config.balances.map((balance) => [
    balance.fighter_id == null ? null : stringValue(balance.fighter_id),
    numberValue(balance.balance),
  ]));
  const choresByBoss = new Map<string, Chore[]>();
  for (const row of config.chores) {
    if (row.deleted_at) continue;
    const bossId = stringValue(row.boss_id);
    const chores = choresByBoss.get(bossId) ?? [];
    chores.push({
      id: stringValue(row.id),
      title: stringValue(row.title),
      damage: numberValue(row.damage),
      repeatable: booleanValue(row.repeatable),
    });
    choresByBoss.set(bossId, chores);
  }

  const bosses: Boss[] = config.bosses.filter((row) => !row.deleted_at).map((row) => {
    const chores = choresByBoss.get(stringValue(row.id)) ?? [];
    return {
      id: stringValue(row.id),
      name: stringValue(row.name),
      sprite: stringValue(row.sprite),
      frames: numberValue(row.frames),
      rare: booleanValue(row.rare),
      hue: row.hue == null ? undefined : numberValue(row.hue),
      trigger: {
        type: stringValue(row.trigger_type, 'daglig') as TriggerType,
        day: row.trigger_day == null ? undefined : numberValue(row.trigger_day),
        date: row.trigger_date == null ? undefined : numberValue(row.trigger_date),
        note: row.trigger_note == null ? undefined : stringValue(row.trigger_note),
      },
      chores,
      hp: maxHpOf(chores),
      clearedCycle: '',
      usedChores: [],
      dormant: booleanValue(row.dormant),
      unlockAt: numberValue(row.unlock_at),
    };
  });
  const fighters = config.fighters.filter((row) => !row.deleted_at).map((row) => ({
    id: stringValue(row.id),
    name: stringValue(row.name),
    color: stringValue(row.color),
    avatar: avatars.get(stringValue(row.id)),
    streak: numberValue(row.streak),
    coins: balances.get(stringValue(row.id)) ?? numberValue(row.coins_cached),
    careerXp: numberValue(row.career_xp_cached),
  }));

  return {
    ...current,
    bosses,
    fighters,
    log: [],
    redemptions: [],
    activeFighterId: fighters[0]?.id ?? null,
    currentBossId: bosses[0]?.id ?? '',
    pool: balances.get(null) ?? 0,
    victories: numberValue(config.household.victories_baseline),
    goldenRevealed: false,
  };
}
