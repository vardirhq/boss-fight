import assert from 'node:assert/strict';
import test from 'node:test';
import { childAuthRateLimit, committedChildPairAuthentication } from './childAuth.js';

test('failed pairing authentication commits before the route reports unauthorized', async () => {
  const events: string[] = [];
  await assert.rejects(
    committedChildPairAuthentication(async () => {
      events.push('failed-attempt-written');
      events.push('transaction-committed');
      return { authenticated: false };
    }),
    /Unauthorized/,
  );
  assert.deepEqual(events, ['failed-attempt-written', 'transaction-committed']);
});

test('successful pairing authentication returns the committed transaction value', async () => {
  assert.deepEqual(
    await committedChildPairAuthentication(async () => ({ authenticated: true, value: { fighterId: 'fighter-1' } })),
    { fighterId: 'fighter-1' },
  );
});

test('child authentication has a stricter route limit than the global default', () => {
  assert.equal(childAuthRateLimit.max, 20);
  assert.equal(childAuthRateLimit.timeWindow, '10 minutes');
});
