import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SESSION_POLICY, sessionExpiry, sessionIdleCutoff, sessionPolicy } from './sessionPolicy.js';

test('sessions have bounded absolute and idle lifetimes', () => {
  const now = new Date('2026-08-05T12:00:00.000Z');
  assert.equal(sessionExpiry(now).toISOString(), '2026-11-03T12:00:00.000Z');
  assert.equal(sessionIdleCutoff(now).toISOString(), '2026-07-06T12:00:00.000Z');
  assert.deepEqual(sessionPolicy({}), DEFAULT_SESSION_POLICY);
});

test('session lifetime overrides require ordered positive whole days', () => {
  assert.deepEqual(sessionPolicy({ SESSION_DAYS: '60', SESSION_IDLE_DAYS: '14' }), {
    absoluteDays: 60, idleDays: 14,
  });
  assert.throws(() => sessionPolicy({ SESSION_DAYS: '0' }), /positive integer/);
  assert.throws(() => sessionPolicy({ SESSION_IDLE_DAYS: '2.5' }), /positive integer/);
  assert.throws(() => sessionPolicy({ SESSION_DAYS: '10', SESSION_IDLE_DAYS: '11' }), /cannot exceed/);
});
