import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyInstance, FastifyRequest } from 'fastify';

test('sync push route module registers the principal-protected mutation endpoint', async () => {
  process.env.DATABASE_URL ??= 'postgresql://unused:unused@127.0.0.1:1/unused';
  const { registerSyncPushRoutes } = await import('./syncPushRoutes.js');
  const registered: string[] = [];
  const app = { post: (path: string) => registered.push(`POST ${path}`) } as unknown as FastifyInstance;
  registerSyncPushRoutes(app, {
    requireHouseholdPrincipal: async (_request: FastifyRequest) => ({ userId: 'user', kind: 'user' }),
    requireHouseholdMember: async () => ({ id: 'member', role: 'owner' }),
    requireHouseholdRole: async () => undefined,
    assertHouseholdRow: async () => undefined,
    assertNullableHouseholdRow: async () => undefined,
    entityId: () => '00000000-0000-4000-8000-000000000000',
    serverCycleKey: () => 'cycle',
    serverBossAvailable: () => true,
    serverBossElite: () => false,
  });
  assert.deepEqual(registered, ['POST /api/sync/push']);
});
