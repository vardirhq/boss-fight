import { createHash } from 'node:crypto';

export const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;

export function migrationChecksum(sqlText) {
  return createHash('sha256').update(sqlText).digest('hex');
}

export function orderedMigrationNames(names) {
  const migrations = names.filter((name) => MIGRATION_FILE.test(name)).sort();
  if (new Set(migrations.map((name) => name.slice(0, 4))).size !== migrations.length) {
    throw new Error('Migration sequence numbers must be unique');
  }
  return migrations;
}
