import assert from 'node:assert/strict';
import test from 'node:test';
import { childLoginSchema, eraseAdultSchema, loginSchema, registerSchema, syncPullSchema, syncPushSchema, tokenSchema } from './routeSchemas.js';

test('high-risk schemas reject unknown fields and bound credentials and sync collections', () => {
  assert.equal(registerSchema.body.additionalProperties, false);
  assert.equal(registerSchema.body.properties.password.minLength, 10);
  assert.equal(loginSchema.body.properties.email.maxLength, 254);
  assert.equal(syncPullSchema.querystring.additionalProperties, false);
  assert.equal(syncPullSchema.querystring.properties.known_avatar_hashes.maxLength, 6_000);
  assert.equal(syncPushSchema.body.properties.mutations.maxItems, 200);
  assert.equal(syncPushSchema.body.properties.mutations.items.additionalProperties, false);
  assert.equal(tokenSchema.body.properties.token.maxLength, 512);
  assert.deepEqual(childLoginSchema.body.required, ['householdId', 'fighterId', 'pin']);
  assert.equal(eraseAdultSchema.body.additionalProperties, false);
});
