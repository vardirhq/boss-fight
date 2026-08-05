import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptedPrivacyNoticeVersion, assertChildErasureTarget, assertHouseholdErasureConfirmation, householdExportFields, PRIVACY_NOTICE_VERSION, privacyExportRows } from './privacy.js';

const secrets = ['password_hash', 'pin_hash', 'token_hash', 'code_hash', 'join_code_hash'];

test('privacy export projections never expose authentication secrets', () => {
  assert.match(PRIVACY_NOTICE_VERSION, /^\d{4}-\d{2}-\d{2}(?:\.\d+)?$/);
  for (const fields of Object.values(householdExportFields)) {
    for (const secret of secrets) assert.equal(fields.includes(secret as never), false, secret);
  }
});

test('privacy export discards fields outside its explicit contract', () => {
  assert.deepEqual(privacyExportRows('devices', [{
    id: 'device-1', name: 'Tablet', token_hash: 'secret', code_hash: 'secret', internal: true,
  }]), [{ id: 'device-1', name: 'Tablet' }]);
});

test('the previous released notice remains accepted during APK rollout', () => {
  assert.equal(acceptedPrivacyNoticeVersion(PRIVACY_NOTICE_VERSION), PRIVACY_NOTICE_VERSION);
  assert.equal(acceptedPrivacyNoticeVersion('2026-08-05'), '2026-08-05');
  assert.equal(acceptedPrivacyNoticeVersion('2026-08-05.2'), '2026-08-05.2');
  assert.throws(() => acceptedPrivacyNoticeVersion('2026-01-01'));
});

test('self-service child erasure cannot target adult or unclaimed fighters', () => {
  assert.equal(assertChildErasureTarget({ userId: 'child-1', userKind: 'child', role: 'child' }), 'child-1');
  assert.throws(() => assertChildErasureTarget({ userId: 'adult-1', userKind: 'adult', role: 'member' }));
  assert.throws(() => assertChildErasureTarget({ userId: null, userKind: null, role: null }));
});

test('household erasure requires an exact trimmed name confirmation', () => {
  assert.doesNotThrow(() => assertHouseholdErasureConfirmation({ currentName: 'The Family', confirmedName: ' The Family ' }));
  assert.throws(() => assertHouseholdErasureConfirmation({ currentName: 'The Family', confirmedName: 'the family' }));
  assert.throws(() => assertHouseholdErasureConfirmation({ currentName: 'The Family', confirmedName: null }));
});
