import type { Db } from './sqlite';

export const SCHEMA_VERSION = 2;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS bosses (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  sprite        TEXT NOT NULL,
  frames        INTEGER NOT NULL DEFAULT 0,
  rare          INTEGER NOT NULL DEFAULT 0,
  trigger_type  TEXT NOT NULL,
  trigger_day   INTEGER,
  trigger_date  INTEGER,
  trigger_note  TEXT,
  hp            INTEGER NOT NULL DEFAULT 0,
  cleared_cycle TEXT NOT NULL DEFAULT '',
  sort          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chores (
  id         TEXT PRIMARY KEY,
  boss_id    TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  damage     INTEGER NOT NULL DEFAULT 0,
  repeatable INTEGER NOT NULL DEFAULT 0,
  sort       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chores_boss ON chores(boss_id);

CREATE TABLE IF NOT EXISTS used_chores (
  boss_id  TEXT NOT NULL,
  chore_id TEXT NOT NULL,
  PRIMARY KEY (boss_id, chore_id)
);

CREATE TABLE IF NOT EXISTS fighters (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL DEFAULT '',
  color     TEXT NOT NULL,
  avatar    TEXT,
  streak    INTEGER NOT NULL DEFAULT 0,
  coins     INTEGER NOT NULL DEFAULT 0,
  career_xp INTEGER NOT NULL DEFAULT 0,
  sort      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS battle_log (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  boss_id    TEXT NOT NULL,
  fighter_id TEXT NOT NULL,
  attack     TEXT NOT NULL,
  damage     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS redemptions (
  vid        TEXT PRIMARY KEY,
  icon       TEXT NOT NULL DEFAULT '',
  title      TEXT NOT NULL DEFAULT '',
  cost       INTEGER NOT NULL DEFAULT 0,
  at         TEXT NOT NULL DEFAULT '',
  who        TEXT NOT NULL DEFAULT '',
  used       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);
`;

export const ALL_TABLES = [
  'meta', 'bosses', 'chores', 'used_chores', 'fighters', 'battle_log', 'redemptions',
];

/** Create tables if they don't exist yet (idempotent DDL). */
export function ensureSchema(db: Db): void {
  db.execScript(SCHEMA_SQL);
}

/** Stored schema version, or 0 if the database has never been stamped. */
export function readSchemaVersion(db: Db): number {
  const rows = db.query<{ value: string }>('SELECT value FROM meta WHERE key = ?', ['schema_version']);
  if (rows.length === 0) return 0;
  const n = Number(rows[0].value);
  return Number.isFinite(n) ? n : 0;
}

export function writeSchemaVersion(db: Db, version: number): void {
  db.run(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ['schema_version', String(version)],
  );
}
