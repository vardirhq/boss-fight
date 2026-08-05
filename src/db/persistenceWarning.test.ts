import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldShowPersistenceWarning } from './persistenceWarning.ts';

test('hides the expected OPFS fallback warning in native apps', () => {
  assert.equal(shouldShowPersistenceWarning(
    { mode: 'fallback', issue: 'opfs-unavailable' },
    true,
  ), false);
});

test('keeps the OPFS fallback warning visible in browsers', () => {
  assert.equal(shouldShowPersistenceWarning(
    { mode: 'fallback', issue: 'opfs-unavailable' },
    false,
  ), true);
});

test('keeps actionable persistence failures visible everywhere', () => {
  for (const issue of ['restore-failed', 'write-failed'] as const) {
    assert.equal(shouldShowPersistenceWarning({ mode: 'fallback', issue }, true), true);
    assert.equal(shouldShowPersistenceWarning({ mode: 'fallback', issue }, false), true);
  }
});

test('does not show a warning when persistence is healthy', () => {
  assert.equal(shouldShowPersistenceWarning({ mode: 'opfs', issue: null }, false), false);
});
