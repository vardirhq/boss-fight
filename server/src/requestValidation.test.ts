import assert from 'node:assert/strict';
import test from 'node:test';
import {
  optionalBoolean, optionalBooleanOrNull, optionalNumber, optionalNumberOrNull,
  optionalString, queryInteger, requiredString, requireObjectArray, stringValue,
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
  assert.throws(() => optionalNumber(1_000_000_001), /supported range/);
  assert.equal(queryInteger('42', 'cursor'), 42);
  assert.throws(() => queryInteger('-1', 'cursor'), /non-negative integer/);
  assert.throws(() => queryInteger('1.5', 'cursor'), /non-negative integer/);
  assert.throws(() => queryInteger('01', 'cursor'), /non-negative integer/);
});

test('strings are trimmed and bounded according to their field class', () => {
  assert.equal(requiredString(' Boss ', 'boss.name'), 'Boss');
  assert.throws(() => requiredString('x'.repeat(121), 'fighter.name'), /at most 120/);
  assert.throws(() => requiredString('x'.repeat(255), 'email'), /at most 254/);
  assert.equal(optionalString(' note '), 'note');
  assert.throws(() => optionalString('x'.repeat(1_001)), /at most 1000/);
  assert.throws(() => stringValue('x'.repeat(2_001), 'description'), /at most 2000/);
});
