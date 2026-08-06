import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyInstance } from 'fastify';

test('authentication and account route module registers the complete lifecycle surface', async () => {
  process.env.DATABASE_URL ??= 'postgresql://unused:unused@127.0.0.1:1/unused';
  const { registerAuthAccountRoutes } = await import('./authAccountRoutes.js');
  const registered: string[] = [];
  const app = {
    post: (path: string) => registered.push(`POST ${path}`),
    get: (path: string) => registered.push(`GET ${path}`),
    delete: (path: string) => registered.push(`DELETE ${path}`),
  } as unknown as FastifyInstance;
  registerAuthAccountRoutes(app);
  assert.deepEqual(registered, [
    'POST /api/auth/register',
    'POST /api/auth/login',
    'POST /api/auth/email-verification/resend',
    'POST /api/auth/email-verification/confirm',
    'POST /api/auth/password-reset/request',
    'POST /api/auth/password-reset/confirm',
    'POST /api/auth/child-login',
    'POST /api/auth/child-pair',
    'POST /api/auth/logout',
    'GET /api/me/sessions',
    'DELETE /api/me/sessions/:sessionId',
    'GET /api/me',
    'DELETE /api/me',
  ]);
});

test('credential primitives round-trip secrets without accepting another secret', async () => {
  const { hashPassword, hashSecret, verifyPassword, verifySecret } = await import('./authentication.js');
  const passwordHash = await hashPassword('correct horse battery staple');
  const pinHash = await hashSecret('8251');
  assert.equal(await verifyPassword('correct horse battery staple', passwordHash), true);
  assert.equal(await verifyPassword('wrong password', passwordHash), false);
  assert.equal(await verifySecret('8251', pinHash), true);
  assert.equal(await verifySecret('8252', pinHash), false);
});
