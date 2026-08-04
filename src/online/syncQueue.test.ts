import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMutationResults, sendableMutations } from './syncQueue.ts';
import type { PendingMutation } from './api.ts';

const pending = (id: string): PendingMutation => ({
  id, householdId: 'household-1', type: 'chore_completion', payload: {}, createdAt: '2026-08-04T00:00:00Z', attempts: 0,
});

test('accepted and duplicate mutations leave the queue while rejected mutations remain diagnostic', () => {
  const next = applyMutationResults(
    [pending('accepted'), pending('duplicate'), pending('rejected'), pending('later')],
    'household-1',
    [
      { id: 'accepted', type: 'chore_completion', outcome: 'accepted' },
      { id: 'duplicate', type: 'chore_completion', outcome: 'duplicate' },
      { id: 'rejected', type: 'chore_completion', outcome: 'rejected', code: 'mutation_rejected', error: 'No longer valid' },
    ],
    '2026-08-04T01:00:00Z',
  );
  assert.deepEqual(next.map(({ id }) => id), ['rejected', 'later']);
  assert.equal(next[0].rejectedAt, '2026-08-04T01:00:00Z');
  assert.equal(next[0].lastError, 'No longer valid');
  assert.deepEqual(sendableMutations(next, 'household-1').map(({ id }) => id), ['later']);
});

test('results never alter another household queue', () => {
  const other = { ...pending('same-id'), householdId: 'household-2' };
  assert.deepEqual(applyMutationResults([other], 'household-1', [
    { id: 'same-id', type: 'chore_completion', outcome: 'accepted' },
  ], 'now'), [other]);
});
