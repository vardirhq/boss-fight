import assert from 'node:assert/strict';
import test from 'node:test';
import { publicApiError } from './apiErrors.js';

test('API error policy maps framework, database, domain, and unexpected failures', () => {
  assert.equal(publicApiError(Object.assign(new Error('schema'), { statusCode: 400 })).body.code, 'invalid_request');
  assert.equal(publicApiError(Object.assign(new Error('duplicate'), { code: '23505' })).status, 409);
  assert.equal(publicApiError(new Error('Chore is already completed for this cycle')).status, 422);
  assert.equal(publicApiError(new Error('Unauthorized')).status, 401);
  assert.deepEqual(publicApiError(new Error('sensitive database detail')), {
    status: 500, body: { error: 'Internal server error', code: 'internal_error' }, unexpected: true,
  });
});
