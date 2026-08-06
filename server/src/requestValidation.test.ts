import assert from 'node:assert/strict';
import test from 'node:test';
import { optionalBoolean, optionalBooleanOrNull, requireObjectArray } from './requestValidation.js';

test('boolean input is never coerced from strings or numbers', () => {
  assert.equal(optionalBoolean(true), true);
  assert.equal(optionalBoolean(false), false);
  assert.equal(optionalBoolean(undefined), false);
  assert.equal(optionalBooleanOrNull(null), null);
  assert.throws(() => optionalBoolean('false'), /Expected boolean value/);
  assert.throws(() => optionalBoolean(1), /Expected boolean value/);
});

test('object arrays reject invalid members and excessive request fan-out', () => {
  assert.deepEqual(requireObjectArray([{ id: 1 }], 'items', 1), [{ id: 1 }]);
  assert.throws(() => requireObjectArray('items', 'items'), /must be an array/);
  assert.throws(() => requireObjectArray([null], 'items'), /Expected JSON object/);
  assert.throws(() => requireObjectArray([{}, {}], 'items', 1), /at most 1 item/);
});
