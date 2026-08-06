import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_LOGIN_LOCKOUT_POLICY, adultLoginRateLimit, loginLocked,
  loginLockoutPolicy, loginLockoutUntil, registrationRateLimit,
} from './loginPolicy.js';

const now = new Date('2026-08-06T12:00:00Z');

test('adult credential routes are bounded far below the global allowance', () => {
  assert.ok(adultLoginRateLimit.max <= 20);
  assert.ok(registrationRateLimit.max <= 10);
  assert.equal(typeof adultLoginRateLimit.timeWindow, 'string');
  assert.equal(typeof registrationRateLimit.timeWindow, 'string');
});

test('a lock is applied only once consecutive failures reach the threshold', () => {
  const policy = DEFAULT_LOGIN_LOCKOUT_POLICY;
  assert.equal(loginLockoutUntil(policy.threshold - 1, now, policy), null);
  const locked = loginLockoutUntil(policy.threshold, now, policy);
  assert.ok(locked);
  assert.equal(locked.getTime(), now.getTime() + policy.lockMinutes * 60_000);
});

test('locks expire on their own so guessing cannot hold an owner out of the household', () => {
  const policy = { threshold: 3, lockMinutes: 15 };
  const until = loginLockoutUntil(5, now, policy)!;
  assert.equal(loginLocked(until, new Date(until.getTime() - 1)), true);
  assert.equal(loginLocked(until, until), false);
  assert.equal(loginLocked(until, new Date(until.getTime() + 1)), false);
});

test('an account with no recorded lock is never treated as locked', () => {
  assert.equal(loginLocked(null, now), false);
  assert.equal(loginLocked(undefined, now), false);
  assert.equal(loginLocked('not a date', now), false);
  // Timestamps arrive from the driver as strings or Dates depending on the column.
  assert.equal(loginLocked(new Date(now.getTime() + 60_000).toISOString(), now), true);
});

test('the policy is configurable but rejects values that would disable it', () => {
  assert.deepEqual(loginLockoutPolicy({ LOGIN_LOCKOUT_THRESHOLD: '4', LOGIN_LOCKOUT_MINUTES: '30' } as never), {
    threshold: 4, lockMinutes: 30,
  });
  assert.deepEqual(loginLockoutPolicy({} as never), DEFAULT_LOGIN_LOCKOUT_POLICY);
  assert.throws(() => loginLockoutPolicy({ LOGIN_LOCKOUT_THRESHOLD: '0' } as never), /positive integer/);
  assert.throws(() => loginLockoutPolicy({ LOGIN_LOCKOUT_MINUTES: '-5' } as never), /positive integer/);
});
