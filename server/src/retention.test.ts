import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_RETENTION_POLICY, retentionCutoffs, retentionPolicy } from './retentionPolicy.js';

test('retention defaults are conservative and cutoffs are deterministic', () => {
  const now = new Date('2026-08-05T12:00:00.000Z');
  assert.deepEqual(retentionPolicy({}), DEFAULT_RETENTION_POLICY);
  assert.deepEqual(retentionCutoffs(now), {
    invites: new Date('2026-07-06T12:00:00.000Z'),
    pairings: new Date('2026-07-29T12:00:00.000Z'),
    sessions: new Date('2026-07-06T12:00:00.000Z'),
    passwordResets: new Date('2026-07-06T12:00:00.000Z'),
    devices: new Date('2026-07-06T12:00:00.000Z'),
    deletedAvatars: new Date('2026-07-06T12:00:00.000Z'),
  });
});

test('retention overrides require positive whole days', () => {
  assert.equal(retentionPolicy({ RETENTION_PAIRINGS_DAYS: '14' }).pairingsDays, 14);
  for (const value of ['0', '-1', '1.5', 'no']) {
    assert.throws(() => retentionPolicy({ RETENTION_SESSIONS_DAYS: value }));
  }
});
