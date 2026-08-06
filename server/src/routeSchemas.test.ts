import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bootstrapSchema, bossCreateSchema, childCreateSchema, childLoginSchema, chorePatchSchema,
  eraseAdultSchema, fighterPatchSchema, householdEraseSchema, inviteCreateSchema, loginSchema,
  registerSchema, rewardCreateSchema, syncPullSchema, syncPushSchema, tokenSchema,
} from './routeSchemas.js';

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

test('household and gameplay schemas close objects and enforce domain bounds', () => {
  assert.equal(bootstrapSchema.body.additionalProperties, false);
  assert.equal(bootstrapSchema.body.properties.fighters.maxItems, 100);
  assert.equal(bootstrapSchema.body.properties.chores.maxItems, 500);
  assert.equal(bootstrapSchema.body.properties.bosses.items.properties.trigger.additionalProperties, false);
  assert.equal(householdEraseSchema.body.properties.confirmedName.maxLength, 120);
  assert.equal(fighterPatchSchema.body.additionalProperties, false);
  assert.equal(childCreateSchema.body.properties.pin.minLength, 4);
  assert.equal(childCreateSchema.body.properties.authorized.const, true);
  assert.deepEqual(inviteCreateSchema.body.properties.role.enum, ['parent', 'member']);
  assert.equal(bossCreateSchema.body.properties.frames.minimum, 1);
  assert.equal(chorePatchSchema.body.properties.damage.maximum, 1_000_000_000);
  assert.deepEqual(rewardCreateSchema.body.properties.scope.enum, ['personal', 'group']);
});
