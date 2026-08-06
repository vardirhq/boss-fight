import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyInstance, FastifyRequest } from 'fastify';

test('gameplay route module registers the complete authorized CRUD surface', async () => {
  process.env.DATABASE_URL ??= 'postgresql://unused:unused@127.0.0.1:1/unused';
  const { registerGameplayRoutes } = await import('./gameplayRoutes.js');
  const registered: string[] = [];
  const app = Object.fromEntries(['post', 'patch', 'delete'].map((method) => [method, (path: string) => {
    registered.push(`${method.toUpperCase()} ${path}`);
  }])) as unknown as FastifyInstance;
  registerGameplayRoutes(app, {
    requireAuth: async (_request: FastifyRequest) => ({ userId: 'user', sessionId: 'session' }),
    requireHouseholdRole: async () => undefined,
    assertHouseholdRow: async () => undefined,
  });
  assert.deepEqual(registered, [
    'POST /api/households/:householdId/bosses',
    'PATCH /api/households/:householdId/bosses/:bossId',
    'DELETE /api/households/:householdId/bosses/:bossId',
    'POST /api/households/:householdId/chores',
    'PATCH /api/households/:householdId/chores/:choreId',
    'DELETE /api/households/:householdId/chores/:choreId',
    'POST /api/households/:householdId/rewards',
    'PATCH /api/households/:householdId/rewards/:rewardId',
    'DELETE /api/households/:householdId/rewards/:rewardId',
  ]);
});
