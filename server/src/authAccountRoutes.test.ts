import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyInstance } from 'fastify';

// Importing the route module pulls in the database client, which requires a URL at
// module scope. Set before any dynamic import below.
process.env.DATABASE_URL ??= 'postgresql://unused:unused@127.0.0.1:1/unused';

type RouteOptions = { config?: { rateLimit?: { max?: number; timeWindow?: string } } };
const routeOptions = new Map<string, RouteOptions>();

function registeredRoutes() {
  const registered: string[] = [];
  const record = (method: string) => (path: string, options?: RouteOptions) => {
    registered.push(`${method} ${path}`);
    routeOptions.set(`${method} ${path}`, options ?? {});
  };
  return { registered, app: { post: record('POST'), get: record('GET'), delete: record('DELETE') } as unknown as FastifyInstance };
}

test('authentication and account route module registers the complete lifecycle surface', async () => {
  const { registerAuthAccountRoutes } = await import('./authAccountRoutes.js');
  const { registered, app } = registeredRoutes();
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

test('every credential route carries its own limit, not just the global default', async () => {
  const { registerAuthAccountRoutes } = await import('./authAccountRoutes.js');
  const { app } = registeredRoutes();
  registerAuthAccountRoutes(app);

  // Guessing a password or spraying registration mail must not be bounded only by the
  // global per-IP allowance, which permits hundreds of attempts a minute.
  const credentialRoutes = [
    'POST /api/auth/register',
    'POST /api/auth/login',
    'POST /api/auth/child-login',
    'POST /api/auth/child-pair',
    'POST /api/auth/password-reset/request',
    'POST /api/auth/password-reset/confirm',
    'POST /api/auth/email-verification/resend',
  ];
  for (const route of credentialRoutes) {
    const limit = routeOptions.get(route)?.config?.rateLimit;
    assert.ok(limit, `${route} must declare a route rate limit`);
    assert.ok(Number(limit.max) > 0 && Number(limit.max) <= 30, `${route} limit must be materially stricter than the global default`);
    assert.ok(limit.timeWindow, `${route} must declare a rate limit window`);
  }
});
