import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCanManageMembership, type GovernanceRole } from './governance.js';

function check(actorRole: GovernanceRole, targetRole: GovernanceRole, activeOwnerCount = 2) {
  return () => assertCanManageMembership({
    actorUserId: 'actor', actorRole, targetUserId: 'target', targetRole,
    removingAccess: true, activeOwnerCount,
  });
}

test('owners can administer other members while parents cannot administer adults at or above their role', () => {
  assert.doesNotThrow(check('owner', 'owner'));
  assert.doesNotThrow(check('owner', 'parent'));
  assert.doesNotThrow(check('parent', 'member'));
  assert.doesNotThrow(check('parent', 'child'));
  assert.throws(check('parent', 'owner'));
  assert.throws(check('parent', 'parent'));
});

test('the last active owner and self-administration are protected', () => {
  assert.throws(check('owner', 'owner', 1));
  assert.throws(() => assertCanManageMembership({
    actorUserId: 'same', actorRole: 'owner', targetUserId: 'same', targetRole: 'owner',
    removingAccess: false, activeOwnerCount: 2,
  }));
});
