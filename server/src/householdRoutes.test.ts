import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyInstance } from 'fastify';

test('household route module registers the complete lifecycle and governance surface', async () => {
  process.env.DATABASE_URL ??= 'postgresql://unused:unused@127.0.0.1:1/unused';
  const { registerHouseholdRoutes } = await import('./householdRoutes.js');
  const registered: string[] = [];
  const app = {
    post: (path: string) => registered.push(`POST ${path}`),
    get: (path: string) => registered.push(`GET ${path}`),
    patch: (path: string) => registered.push(`PATCH ${path}`),
    delete: (path: string) => registered.push(`DELETE ${path}`),
  } as unknown as FastifyInstance;
  registerHouseholdRoutes(app, {
    entityId: () => '00000000-0000-4000-8000-000000000000',
    decorateBosses: (rows) => rows,
  });
  assert.deepEqual(registered, [
    'POST /api/bootstrap',
    'GET /api/households/:householdId/config',
    'GET /api/households/:householdId/export',
    'DELETE /api/households/:householdId',
    'PATCH /api/households/:householdId',
    'POST /api/households/:householdId/fighters',
    'PATCH /api/households/:householdId/fighters/:fighterId',
    'DELETE /api/households/:householdId/fighters/:fighterId',
    'POST /api/households/:householdId/children',
    'POST /api/households/:householdId/fighters/:fighterId/pin',
    'POST /api/households/:householdId/fighters/:fighterId/suspend',
    'POST /api/households/:householdId/fighters/:fighterId/unlink',
    'DELETE /api/households/:householdId/children/:fighterId',
  ]);
});
