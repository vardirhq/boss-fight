import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMutationResults, isVoucherId, sendableMutations, voucherId } from './syncQueue.ts';
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

test('voucher ids can address a server redemption; legacy local ids cannot', () => {
  const id = voucherId();
  assert.equal(isVoucherId(id), true);
  // A redemption row is keyed by its mutation id, so the two id spaces must agree.
  assert.equal(isVoucherId(crypto.randomUUID()), true);
  // The pre-fix local format. Sending one is rejected by the server for good.
  assert.equal(isVoucherId(String(Date.now() + Math.random())), false);
  assert.equal(isVoucherId('1785072041123.4817'), false);
  assert.equal(isVoucherId(''), false);
});

test('a redeemed voucher marked used resolves against the row its mutation created', () => {
  // redeemPersonal adopts the mutation id, so the later update addresses that row
  // instead of a local-only id the server would reject.
  const redemption = pending(voucherId());
  const settled = applyMutationResults(
    [redemption],
    'household-1',
    [{ id: redemption.id, type: 'reward_redemption', outcome: 'accepted' }],
    '2026-08-06T01:00:00Z',
  );
  assert.deepEqual(settled, []);
  assert.equal(isVoucherId(redemption.id), true);
});
