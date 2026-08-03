import { maxHpOf } from '../game/logic';
import { REWARDS_GROUP, REWARDS_PERSONAL } from '../game/seed';
import type { Boss, Chore, Fighter, GameState, TriggerType } from '../game/types';
import type { BootstrapSnapshot, ServerHouseholdConfig, ServerSyncState } from './api';

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
      currentCycleKey: row.current_cycle_key == null ? undefined : stringValue(row.current_cycle_key),
      available: row.available == null ? undefined : booleanValue(row.available),
      elite: row.elite == null ? undefined : booleanValue(row.elite),
    };
  });
  const fighters: Fighter[] = config.fighters.filter((row) => !row.deleted_at).map((row) => ({
    id: stringValue(row.id),
    name: stringValue(row.name),
    color: stringValue(row.color),
    avatar: avatars.get(stringValue(row.id)),
    streak: numberValue(row.streak),
    coins: balances.get(stringValue(row.id)) ?? numberValue(row.coins_cached),
    careerXp: numberValue(row.career_xp_cached),
    userId: row.user_id == null ? undefined : stringValue(row.user_id),
    userKind: row.user_kind === 'child' ? ('child' as const) : row.user_kind === 'adult' ? ('adult' as const) : undefined,
    accountStatus: row.account_status === 'suspended' ? 'suspended'
      : row.account_status === 'left' ? 'left'
        : row.account_status === 'invited' ? 'invited'
          : row.account_status === 'active' ? 'active' : undefined,
    requireOwnDevice: booleanValue(row.require_own_device),
  }));

  return {
    ...current,
    bosses,
    fighters,
    log: [],
    redemptions: [],
    activeFighterId: fighters.some((fighter) => fighter.id === current.activeFighterId)
      ? current.activeFighterId
      : fighters[0]?.id ?? null,
    currentBossId: bosses.some((boss) => boss.id === current.currentBossId)
      ? current.currentBossId
      : bosses[0]?.id ?? '',
    pool: balances.get(null) ?? 0,
    victories: numberValue(config.household.victories_baseline),
    goldenRevealed: false,
  };
}

export function serverSyncToGameState(sync: ServerSyncState, current: GameState): GameState {
  const configuration: ServerHouseholdConfig = {
    household: sync.mutable.households[0] ?? {},
    fighters: sync.mutable.fighters,
    fighterAvatars: sync.mutable.fighter_avatars,
    bosses: sync.mutable.bosses,
    chores: sync.mutable.chores,
    rewards: sync.mutable.rewards,
    balances: [],
  };
  const base = serverConfigToGameState(configuration, current);
  const resets = sync.events.boss_resets;
  const completions = sync.events.chore_completions.filter((row) => !row.voided_at);
  const victories = sync.events.boss_victories;
  const wallet = sync.events.wallet_transactions;

  const balances = new Map<string | null, number>();
  for (const row of wallet) {
    const fighterId = row.fighter_id == null ? null : stringValue(row.fighter_id);
    balances.set(fighterId, (balances.get(fighterId) ?? 0) + numberValue(row.amount));
  }
  const careerXp = new Map<string, number>();
  for (const row of completions) {
    const fighterId = stringValue(row.fighter_id);
    careerXp.set(fighterId, (careerXp.get(fighterId) ?? 0) + numberValue(row.damage));
  }

  const bosses = base.bosses.map((boss) => {
    const currentCycle = boss.currentCycleKey ?? cycleKeyForBoss(boss);
    const resetSeq = resets
      .filter((row) => stringValue(row.boss_id) === boss.id && stringValue(row.cycle_key) === currentCycle)
      .reduce((maximum, row) => Math.max(maximum, numberValue(row.reset_seq)), 0);
    const attacks = completions.filter((row) => (
      stringValue(row.boss_id) === boss.id
      && stringValue(row.cycle_key) === currentCycle
      && numberValue(row.reset_seq) === resetSeq
    ));
    const defeated = victories.some((row) => (
      stringValue(row.boss_id) === boss.id
      && stringValue(row.cycle_key) === currentCycle
      && numberValue(row.reset_seq) === resetSeq
    ));
    return {
      ...boss,
      hp: Math.max(0, maxHpOf(boss.chores) - attacks.reduce((sum, row) => sum + numberValue(row.damage), 0)),
      usedChores: attacks.map((row) => stringValue(row.chore_id)),
      clearedCycle: defeated ? currentCycle : '',
      resetSeq,
    };
  });
  const currentBoss = bosses.find((boss) => boss.id === base.currentBossId) ?? bosses[0];
  const currentCycle = currentBoss ? cycleKeyForBoss(currentBoss) : '';
  const currentReset = currentBoss?.resetSeq ?? 0;
  const log = completions
    .filter((row) => stringValue(row.boss_id) === currentBoss?.id
      && stringValue(row.cycle_key) === currentCycle
      && numberValue(row.reset_seq) === currentReset)
    .map((row) => ({
      bossId: stringValue(row.boss_id),
      fighterId: stringValue(row.fighter_id),
      attack: stringValue(row.chore_title),
      damage: numberValue(row.damage),
    }))
    .reverse();
  const baseline = numberValue(configuration.household.victories_baseline);

  return {
    ...base,
    bosses,
    fighters: base.fighters.map((fighter) => ({
      ...fighter,
      coins: balances.get(fighter.id) ?? 0,
      careerXp: careerXp.get(fighter.id) ?? numberValue(
        sync.mutable.fighters.find((row) => stringValue(row.id) === fighter.id)?.career_xp_cached,
      ),
    })),
    log,
    redemptions: sync.events.reward_redemptions.map((row) => ({
      vid: stringValue(row.id),
      icon: stringValue(row.icon),
      title: stringValue(row.title),
      cost: numberValue(row.cost),
      at: stringValue(row.created_at).slice(0, 10),
      who: row.fighter_id == null
        ? 'Felles'
        : base.fighters.find((fighter) => fighter.id === stringValue(row.fighter_id))?.name ?? '',
      used: row.status === 'used',
    })),
    pool: balances.get(null) ?? 0,
    victories: baseline + victories.length,
    goldenRevealed: victories.some((row) => booleanValue(row.rare)),
  };
}

function cycleKeyForBoss(boss: Boss, now = new Date()) {
  if (boss.currentCycleKey) return boss.currentCycleKey;
  const trigger = boss.trigger;
  if (trigger.type === 'daglig' || trigger.type === 'sjelden') return `d${now.toDateString()}`;
  if (trigger.type === 'ukentlig') {
    const start = new Date(now.getFullYear(), 0, 1);
    const week = Math.floor(((now.getTime() - start.getTime()) / 86400000 + start.getDay()) / 7);
    return `w${now.getFullYear()}-${week}`;
  }
  if (trigger.type === 'månedlig') return `m${now.getFullYear()}-${now.getMonth()}`;
  return 'alltid';
}
