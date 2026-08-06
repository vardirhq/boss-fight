import assert from 'node:assert/strict';
import test from 'node:test';
import { publicSyncRows, syncPublicFields } from './syncProjection.js';

const forbidden = [
  'token_hash', 'join_code_hash', 'revoked_at', 'deleted_at', 'updated_at', 'version', 'created_by_user_id',
  'invited_by_user_id', 'performed_by_user_id', 'performed_by_device_id',
  'voided_by_user_id', 'requested_by_user_id', 'approved_by_user_id',
];

test('sync projections exclude credentials and internal actor metadata', () => {
  for (const fields of Object.values(syncPublicFields)) {
    for (const field of forbidden) assert.equal(fields.includes(field as never), false, `${field} must not be public`);
  }
});

test('the response boundary discards fields outside each public contract', () => {
  assert.deepEqual(publicSyncRows('households', [{
    id: 'household-1', name: 'Home', timezone: 'Europe/Oslo', victories_baseline: 3,
    join_code_hash: 'secret', deleted_at: 'internal', configuration_revision: 8,
  }]), [{ id: 'household-1', name: 'Home', timezone: 'Europe/Oslo', victories_baseline: 3 }]);

  assert.deepEqual(publicSyncRows('wallet_transactions', [{
    id: 'wallet-1', fighter_id: 'fighter-1', amount: 4, server_seq: 9,
    created_by_user_id: 'user-1', note: 'internal note', reference_id: 'private',
  }]), [{ id: 'wallet-1', fighter_id: 'fighter-1', amount: 4, server_seq: 9 }]);
});

test('fighter projections carry the immutable career xp baseline', () => {
  // Clients project lifetime XP as baseline + replayed completions. Dropping the
  // baseline from the boundary silently collapses every fighter's level instead.
  assert.equal(syncPublicFields.fighters.includes('career_xp_baseline'), true);
  assert.deepEqual(publicSyncRows('fighters', [{
    id: 'fighter-1', name: 'Ada', color: '#fff', career_xp_cached: 5042,
    career_xp_baseline: 5000, version: 3, deleted_at: null,
  }]), [{
    id: 'fighter-1', name: 'Ada', color: '#fff', career_xp_cached: 5042, career_xp_baseline: 5000,
  }]);
});
