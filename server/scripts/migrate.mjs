import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { migrationChecksum, orderedMigrationNames } from './migration-lib.mjs';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(serverRoot, 'migrations');
const schemaPath = join(serverRoot, 'schema.sql');
const client = postgres(databaseUrl, { max: 1, connect_timeout: 10 });

try {
  const names = orderedMigrationNames(await readdir(migrationsDir));
  const migrations = await Promise.all(names.map(async (name) => {
    const sqlText = await readFile(join(migrationsDir, name), 'utf8');
    return { name, sqlText, checksum: migrationChecksum(sqlText) };
  }));
  const schemaSql = await readFile(schemaPath, 'utf8');
  const schemaChecksum = migrationChecksum(schemaSql);

  const applied = await client.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('boss-kamp-schema-migrations')::bigint)`;
    await tx`
      create table if not exists schema_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `;

    const [schemaState] = await tx`select to_regclass('public.households') is not null as initialized`;
    const [baseline] = await tx`select checksum from schema_migrations where name = '0000_schema_snapshot'`;
    if (!schemaState.initialized) await tx.unsafe(schemaSql);
    if (!baseline) {
      await tx`
        insert into schema_migrations (name, checksum)
        values ('0000_schema_snapshot', ${schemaChecksum})
      `;
    }

    const completed = [];
    for (const migration of migrations) {
      const [existing] = await tx`select checksum from schema_migrations where name = ${migration.name}`;
      if (existing) {
        if (existing.checksum !== migration.checksum) {
          throw new Error(`Applied migration checksum mismatch: ${migration.name}`);
        }
        continue;
      }
      await tx.unsafe(migration.sqlText);
      await tx`
        insert into schema_migrations (name, checksum)
        values (${migration.name}, ${migration.checksum})
      `;
      completed.push(migration.name);
    }
    return completed;
  });

  console.log(applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Database schema is current');
} finally {
  await client.end();
}
