import assert from 'node:assert/strict';
import test from 'node:test';
import { migrationChecksum, orderedMigrationNames } from './migration-lib.mjs';

test('migration files are filtered and ordered by their fixed-width sequence', () => {
  assert.deepEqual(orderedMigrationNames([
    'README.md', '0002_second.sql', '0001_first.sql', '1_invalid.sql',
  ]), ['0001_first.sql', '0002_second.sql']);
});

test('duplicate migration sequences are rejected', () => {
  assert.throws(() => orderedMigrationNames(['0001_first.sql', '0001_other.sql']));
});

test('checksums are stable and sensitive to migration content', () => {
  assert.equal(migrationChecksum('select 1;'), migrationChecksum('select 1;'));
  assert.notEqual(migrationChecksum('select 1;'), migrationChecksum('select 2;'));
});
