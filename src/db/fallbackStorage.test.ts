import assert from 'node:assert/strict';
import test from 'node:test';
import { readStoredExport, writeStoredExport, type StorageLike } from './fallbackStorage.ts';

function storageWith(value: string | null): StorageLike {
  return {
    getItem: () => value,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
}

test('quota failures are returned to the persistence caller', () => {
  const quotaError = new DOMException('Storage quota exceeded', 'QuotaExceededError');
  const storage: StorageLike = {
    ...storageWith(null),
    setItem: () => { throw quotaError; },
  };
  const result = writeStoredExport(storage, 'game', 'export');
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, quotaError);
});

test('corrupted exports are reported instead of treated as an empty database', () => {
  const result = readStoredExport(storageWith('not-a-database'), 'game', () => {
    throw new Error('invalid export');
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(String(result.error), /invalid export/);
});

test('missing exports are a successful empty restore', () => {
  assert.deepEqual(readStoredExport(storageWith(null), 'game', () => new Uint8Array()), { ok: true, value: null });
});
