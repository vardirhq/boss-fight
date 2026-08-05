import assert from 'node:assert/strict';
import test from 'node:test';
import { apiSecurityHeaders, configuredCorsOrigins, normalizedEmail, trustProxyEnabled } from './apiSecurity.js';

test('adult email addresses are normalized and validated', () => {
  assert.equal(normalizedEmail(' Parent@Example.COM '), 'parent@example.com');
  for (const invalid of ['', 'parent', 'parent@', '@example.com', 'parent @example.com']) {
    assert.throws(() => normalizedEmail(invalid), /email/);
  }
});

test('CORS requires explicit production origins and rejects wildcards', () => {
  assert.deepEqual(configuredCorsOrigins('https://app.example, capacitor://localhost', true), [
    'https://app.example', 'capacitor://localhost',
  ]);
  assert.deepEqual(configuredCorsOrigins(undefined, false), ['http://localhost:5173']);
  assert.throws(() => configuredCorsOrigins(undefined, true), /required/);
  assert.throws(() => configuredCorsOrigins('*', true), /explicit/);
});

test('proxy trust is opt-in and API responses have defensive headers', () => {
  assert.equal(trustProxyEnabled(undefined), false);
  assert.equal(trustProxyEnabled('false'), false);
  assert.equal(trustProxyEnabled('TRUE'), true);
  assert.equal(apiSecurityHeaders['x-content-type-options'], 'nosniff');
  assert.equal(apiSecurityHeaders['cache-control'], 'no-store');
});
