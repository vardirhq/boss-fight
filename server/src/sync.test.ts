import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedRows, expectedRevision, mutationError } from './sync.js';

test('configuration revisions must be safe non-negative integers', () => {
  assert.equal(expectedRevision(0), 0);
  assert.equal(expectedRevision(42), 42);
  assert.throws(() => expectedRevision(-1));
  assert.throws(() => expectedRevision(1.5));
  assert.throws(() => expectedRevision('1'));
});

test('configuration conflicts are distinguishable from permanent rejections', () => {
  assert.deepEqual(mutationError(new Error('Configuration revision conflict')), {
    outcome: 'conflict', code: 'configuration_revision_conflict', error: 'Configuration revision conflict',
  });
  assert.equal(mutationError(new Error('Insufficient wallet balance')).outcome, 'rejected');
});

test('event pages expose the limit and whether another row exists', () => {
  assert.deepEqual(boundedRows([1, 2, 3], 2), { rows: [1, 2], hasMore: true });
  assert.deepEqual(boundedRows([1, 2], 2), { rows: [1, 2], hasMore: false });
});
