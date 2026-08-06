import assert from 'node:assert/strict';
import test from 'node:test';
import { householdConnected, playable, showAccountGate } from './accountGate.ts';

const connected = { householdId: 'h1', configurationConnectedAt: '2026-08-06T12:00:00Z' };
const none = { householdId: null, configurationConnectedAt: null };
const halfway = { householdId: 'h1', configurationConnectedAt: null };

test('a household counts as connected only once its configuration has arrived', () => {
  assert.equal(householdConnected(connected), true);
  assert.equal(householdConnected(halfway), false, 'an id alone is not a usable household');
  assert.equal(householdConnected(none), false);
});

test('choosing local play opens the game without an account', () => {
  // The regression this guards: the setup screen covered the app for anyone who had
  // not connected a household, so the offline-first product could not be played offline.
  assert.equal(showAccountGate(none, false), true, 'a new install is still asked to choose');
  assert.equal(showAccountGate(none, true), false, 'local play must reach the game');
  assert.equal(playable(none, true), true);
});

test('a connected household plays regardless of the local choice', () => {
  assert.equal(showAccountGate(connected, false), false);
  assert.equal(showAccountGate(connected, true), false);
});

test('a local player who later connects, then signs out, stays in local play', () => {
  // localPlay is durable and independent of the session, so signing out returns to
  // the local household instead of trapping the player behind the gate again.
  assert.equal(playable(connected, true), true);
  assert.equal(playable(none, true), true);
});
