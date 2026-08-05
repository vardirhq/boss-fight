import assert from 'node:assert/strict';
import test from 'node:test';
import { credentialsForPublicStorage, credentialsToRestore, isOnlineCredentials } from './credentialStorage.ts';

test('native credential records contain only recognized nullable secrets', () => {
  assert.equal(isOnlineCredentials({ sessionToken: 'session', householdDeviceToken: null }), true);
  assert.equal(isOnlineCredentials({ sessionToken: null, householdDeviceToken: 'device' }), true);
  assert.equal(isOnlineCredentials({ sessionToken: null, householdDeviceToken: null }), true);
  assert.equal(isOnlineCredentials({ sessionToken: 42, householdDeviceToken: null }), false);
  assert.equal(isOnlineCredentials({ sessionToken: null }), false);
});

test('native public state is scrubbed while browser state retains its credentials', () => {
  const credentials = { sessionToken: 'session', householdDeviceToken: 'device' };
  assert.deepEqual(credentialsForPublicStorage(credentials, true), { sessionToken: null, householdDeviceToken: null });
  assert.deepEqual(credentialsForPublicStorage(credentials, false), credentials);
});

test('secure credentials take precedence and legacy values support one-time migration', () => {
  const legacy = { sessionToken: 'legacy', householdDeviceToken: null };
  const secure = { sessionToken: 'secure', householdDeviceToken: null };
  assert.deepEqual(credentialsToRestore(secure, legacy), secure);
  assert.deepEqual(credentialsToRestore(null, legacy), legacy);
});
