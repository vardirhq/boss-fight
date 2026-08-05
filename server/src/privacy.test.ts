import assert from 'node:assert/strict';
import test from 'node:test';
import { householdExportFields, PRIVACY_NOTICE_VERSION, privacyExportRows } from './privacy.js';

const secrets = ['password_hash', 'pin_hash', 'token_hash', 'code_hash', 'join_code_hash'];

test('privacy export projections never expose authentication secrets', () => {
  assert.match(PRIVACY_NOTICE_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  for (const fields of Object.values(householdExportFields)) {
    for (const secret of secrets) assert.equal(fields.includes(secret as never), false, secret);
  }
});

test('privacy export discards fields outside its explicit contract', () => {
  assert.deepEqual(privacyExportRows('devices', [{
    id: 'device-1', name: 'Tablet', token_hash: 'secret', code_hash: 'secret', internal: true,
  }]), [{ id: 'device-1', name: 'Tablet' }]);
});
