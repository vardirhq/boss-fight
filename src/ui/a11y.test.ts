import assert from 'node:assert/strict';
import test from 'node:test';
import { nextFocusIndex } from './a11y.tsx';

test('dialog focus wraps in both directions', () => {
  assert.equal(nextFocusIndex(2, 3, false), 0);
  assert.equal(nextFocusIndex(0, 3, true), 2);
  assert.equal(nextFocusIndex(1, 3, false), 2);
  assert.equal(nextFocusIndex(1, 3, true), 0);
  assert.equal(nextFocusIndex(0, 0, false), -1);
});
