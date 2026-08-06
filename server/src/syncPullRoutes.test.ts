import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyInstance, FastifyRequest } from 'fastify';

test('sync pull route module registers the authenticated bounded projection endpoint', async () => {
  process.env.DATABASE_URL ??= 'postgresql://unused:unused@127.0.0.1:1/unused';
  const { registerSyncPullRoutes } = await import('./syncPullRoutes.js');
  const registered: string[] = [];
  const app = { get: (path: string) => registered.push(`GET ${path}`) } as unknown as FastifyInstance;
  registerSyncPullRoutes(app, {
    requireHouseholdPrincipal: async (_request: FastifyRequest) => ({ userId: 'user', kind: 'user' }),
    decorateBosses: (rows) => rows,
  });
  assert.deepEqual(registered, ['GET /api/sync/pull']);
});
