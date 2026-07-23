import type { Db } from './sqlite';
import { ALL_TABLES, migrate } from './schema';
import { seedBosses } from '../game/seed';
import type {
  Boss, Chore, Fighter, GameState, Lang, LogEntry, Redemption, Settings, Trigger, TriggerType,
} from '../game/types';

const DEFAULT_SETTINGS: Settings = {
  lang: 'no',
  sound: true,
  haptics: true,
  reducedMotion: false,
};

/** Read a meta value or fall back to a default. */
function meta(db: Db, key: string): string | null {
  const rows = db.query<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
  return rows.length ? rows[0].value : null;
}

/** Load the whole game state, seeding a fresh database on first run. */
export function loadState(db: Db): GameState {
  migrate(db);

  const bossRows = db.query('SELECT * FROM bosses ORDER BY sort, rowid');
  if (bossRows.length === 0) {
    // First boot: seed bosses and default scalars.
    const state = freshState();
    saveState(db, state);
    return state;
  }

  const choreRows = db.query('SELECT * FROM chores ORDER BY sort, rowid');
  const usedRows = db.query('SELECT boss_id, chore_id FROM used_chores');
  const choresByBoss = new Map<string, Chore[]>();
  for (const r of choreRows) {
    const bossId = String(r.boss_id);
    const list = choresByBoss.get(bossId) ?? [];
    list.push({
      id: String(r.id),
      title: String(r.title),
      damage: Number(r.damage) || 0,
      repeatable: !!Number(r.repeatable),
    });
    choresByBoss.set(bossId, list);
  }
  const usedByBoss = new Map<string, string[]>();
  for (const r of usedRows) {
    const bossId = String(r.boss_id);
    const list = usedByBoss.get(bossId) ?? [];
    list.push(String(r.chore_id));
    usedByBoss.set(bossId, list);
  }

  const bosses: Boss[] = bossRows.map((r) => {
    const trigger: Trigger = {
      type: String(r.trigger_type) as TriggerType,
      note: r.trigger_note == null ? undefined : String(r.trigger_note),
    };
    if (r.trigger_day != null) trigger.day = Number(r.trigger_day);
    if (r.trigger_date != null) trigger.date = Number(r.trigger_date);
    return {
      id: String(r.id),
      name: String(r.name),
      sprite: String(r.sprite),
      frames: Number(r.frames) || 0,
      rare: !!Number(r.rare),
      trigger,
      chores: choresByBoss.get(String(r.id)) ?? [],
      hp: Number(r.hp) || 0,
      clearedCycle: String(r.cleared_cycle ?? ''),
      usedChores: usedByBoss.get(String(r.id)) ?? [],
    };
  });

  const fighters: Fighter[] = db
    .query('SELECT * FROM fighters ORDER BY sort, rowid')
    .map((r) => ({
      id: String(r.id),
      name: String(r.name),
      color: String(r.color),
      avatar: r.avatar == null ? undefined : String(r.avatar),
      streak: Number(r.streak) || 0,
      coins: Number(r.coins) || 0,
      careerXp: Number(r.career_xp) || 0,
    }));

  const log: LogEntry[] = db
    .query('SELECT boss_id, fighter_id, attack, damage FROM battle_log ORDER BY seq DESC')
    .map((r) => ({
      bossId: String(r.boss_id),
      fighterId: String(r.fighter_id),
      attack: String(r.attack),
      damage: Number(r.damage) || 0,
    }));

  const redemptions: Redemption[] = db
    .query('SELECT * FROM redemptions ORDER BY created_at DESC')
    .map((r) => ({
      vid: String(r.vid),
      icon: String(r.icon),
      title: String(r.title),
      cost: Number(r.cost) || 0,
      at: String(r.at),
      who: String(r.who),
      used: !!Number(r.used),
    }));

  const settings: Settings = {
    lang: (meta(db, 'lang') as Lang) || DEFAULT_SETTINGS.lang,
    sound: parseBool(meta(db, 'sound'), DEFAULT_SETTINGS.sound),
    haptics: parseBool(meta(db, 'haptics'), DEFAULT_SETTINGS.haptics),
    reducedMotion: parseBool(meta(db, 'reducedMotion'), DEFAULT_SETTINGS.reducedMotion),
  };

  const fallbackBossId = bosses[0]?.id ?? 'laundry';
  return {
    bosses,
    fighters,
    log,
    redemptions,
    settings,
    activeFighterId: meta(db, 'activeFighterId') || fighters[0]?.id || null,
    currentBossId: meta(db, 'currentBossId') || fallbackBossId,
    pool: parseNum(meta(db, 'pool'), 0),
    victories: parseNum(meta(db, 'victories'), 0),
    goldenRevealed: parseBool(meta(db, 'goldenRevealed'), false),
    onboarded: parseBool(meta(db, 'onboarded'), false),
  };
}

/** Persist the whole game state (simple full rewrite — the dataset is tiny). */
export function saveState(db: Db, state: GameState): void {
  db.transaction(() => {
    db.run('DELETE FROM bosses');
    db.run('DELETE FROM chores');
    db.run('DELETE FROM used_chores');
    db.run('DELETE FROM fighters');
    db.run('DELETE FROM battle_log');
    db.run('DELETE FROM redemptions');

    state.bosses.forEach((b, bi) => {
      db.run(
        `INSERT INTO bosses
           (id, name, sprite, frames, rare, trigger_type, trigger_day, trigger_date, trigger_note, hp, cleared_cycle, sort)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          b.id, b.name, b.sprite, b.frames, b.rare ? 1 : 0,
          b.trigger.type, b.trigger.day ?? null, b.trigger.date ?? null, b.trigger.note ?? null,
          b.hp, b.clearedCycle, bi,
        ],
      );
      b.chores.forEach((c, ci) => {
        db.run(
          'INSERT INTO chores (id, boss_id, title, damage, repeatable, sort) VALUES (?,?,?,?,?,?)',
          [c.id, b.id, c.title, c.damage, c.repeatable ? 1 : 0, ci],
        );
      });
      b.usedChores.forEach((choreId) => {
        db.run('INSERT OR IGNORE INTO used_chores (boss_id, chore_id) VALUES (?,?)', [b.id, choreId]);
      });
    });

    state.fighters.forEach((f, fi) => {
      db.run(
        'INSERT INTO fighters (id, name, color, avatar, streak, coins, career_xp, sort) VALUES (?,?,?,?,?,?,?,?)',
        [f.id, f.name, f.color, f.avatar ?? null, f.streak, f.coins, f.careerXp, fi],
      );
    });

    // Log is stored newest-first in memory; insert reversed so seq keeps order.
    [...state.log].reverse().forEach((e) => {
      db.run('INSERT INTO battle_log (boss_id, fighter_id, attack, damage) VALUES (?,?,?,?)', [
        e.bossId, e.fighterId, e.attack, e.damage,
      ]);
    });

    state.redemptions.forEach((r, i) => {
      db.run(
        'INSERT INTO redemptions (vid, icon, title, cost, at, who, used, created_at) VALUES (?,?,?,?,?,?,?,?)',
        [r.vid, r.icon, r.title, r.cost, r.at, r.who, r.used ? 1 : 0, state.redemptions.length - i],
      );
    });

    const metaPairs: [string, string][] = [
      ['lang', state.settings.lang],
      ['sound', state.settings.sound ? '1' : '0'],
      ['haptics', state.settings.haptics ? '1' : '0'],
      ['reducedMotion', state.settings.reducedMotion ? '1' : '0'],
      ['activeFighterId', state.activeFighterId ?? ''],
      ['currentBossId', state.currentBossId],
      ['pool', String(state.pool)],
      ['victories', String(state.victories)],
      ['goldenRevealed', state.goldenRevealed ? '1' : '0'],
      ['onboarded', state.onboarded ? '1' : '0'],
    ];
    for (const [k, v] of metaPairs) {
      db.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [k, v]);
    }
  });
  db.flush();
}

/** Delete everything and reseed from scratch. */
export function resetState(db: Db): GameState {
  db.wipe(ALL_TABLES);
  migrate(db);
  const state = freshState();
  saveState(db, state);
  return state;
}

function freshState(): GameState {
  const bosses = seedBosses();
  return {
    bosses,
    fighters: [],
    log: [],
    redemptions: [],
    settings: { ...DEFAULT_SETTINGS },
    activeFighterId: null,
    currentBossId: bosses[0]?.id ?? 'laundry',
    pool: 0,
    victories: 0,
    goldenRevealed: false,
    onboarded: false,
  };
}

function parseBool(v: string | null, dflt: boolean): boolean {
  if (v == null) return dflt;
  return v === '1' || v === 'true';
}
function parseNum(v: string | null, dflt: number): number {
  if (v == null) return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}
