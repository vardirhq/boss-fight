import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertRedemptionFunds, assertRedemptionManagerRole, initialRedemption,
  redemptionTransition, requestedRedemptionStatus,
} from './redemption.js';

test('creation is always active and has no client-controlled approver', () => {
  assert.deepEqual(initialRedemption(), { status: 'active', approvedByUserId: null });
});

test('only used and cancelled are accepted transition targets', () => {
  assert.equal(requestedRedemptionStatus('used'), 'used');
  assert.equal(requestedRedemptionStatus('cancelled'), 'cancelled');
  assert.throws(() => requestedRedemptionStatus('active'));
  assert.throws(() => requestedRedemptionStatus('pending'));
});

test('active vouchers can be used or cancelled exactly once', () => {
  assert.equal(redemptionTransition('active', 'used'), 'transition');
  assert.equal(redemptionTransition('active', 'cancelled'), 'transition');
  assert.equal(redemptionTransition('used', 'used'), 'duplicate');
  assert.equal(redemptionTransition('cancelled', 'cancelled'), 'duplicate');
  assert.throws(() => redemptionTransition('used', 'cancelled'));
  assert.throws(() => redemptionTransition('cancelled', 'used'));
});

test('only owners and parents may finalize a redemption', () => {
  assert.doesNotThrow(() => assertRedemptionManagerRole('owner'));
  assert.doesNotThrow(() => assertRedemptionManagerRole('parent'));
  assert.throws(() => assertRedemptionManagerRole('member'));
  assert.throws(() => assertRedemptionManagerRole('child'));
  assert.throws(() => assertRedemptionManagerRole(null));
});

test('the server-snapshotted cost must be covered by the derived balance', () => {
  assert.doesNotThrow(() => assertRedemptionFunds(10, 10));
  assert.doesNotThrow(() => assertRedemptionFunds(11, 10));
  assert.throws(() => assertRedemptionFunds(9, 10));
  assert.throws(() => assertRedemptionFunds(100, -1));
});
