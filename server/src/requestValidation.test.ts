import assert from 'node:assert/strict';
import test from 'node:test';
import {
  optionalBoolean, optionalBooleanOrNull, optionalNumber, optionalNumberOrNull,
  queryInteger, requireObjectArray,
} from './requestValidation.js';

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

test('JSON numbers are strict while query integers accept canonical digit strings', () => {
  assert.equal(optionalNumber(2.5), 2.5);
  assert.equal(optionalNumber(undefined, 4), 4);
  assert.equal(optionalNumberOrNull(null), null);
  assert.throws(() => optionalNumber('2'), /Expected numeric value/);
  assert.throws(() => optionalNumber(true), /Expected numeric value/);
  assert.equal(queryInteger('42', 'cursor'), 42);
  assert.throws(() => queryInteger('-1', 'cursor'), /non-negative integer/);
  assert.throws(() => queryInteger('1.5', 'cursor'), /non-negative integer/);
  assert.throws(() => queryInteger('01', 'cursor'), /non-negative integer/);
});
