import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyInstance, FastifyRequest } from 'fastify';

test('invitation route module registers pairing, delivery, acceptance, and device claim', async () => {
  process.env.DATABASE_URL ??= 'postgresql://unused:unused@127.0.0.1:1/unused';
  const { registerInvitationRoutes } = await import('./invitationRoutes.js');
  const registered: string[] = [];
  const app = { post: (path: string) => registered.push(`POST ${path}`) } as unknown as FastifyInstance;
  registerInvitationRoutes(app, {
    requireAuth: async (_request: FastifyRequest) => ({ userId: 'user', sessionId: 'session' }),
    requireHouseholdRole: async () => undefined,
    assertHouseholdRow: async () => undefined,
    entityId: () => '00000000-0000-4000-8000-000000000000',
  });
  assert.deepEqual(registered, [
    'POST /api/households/:householdId/pairings',
    'POST /api/households/:householdId/invites',
    'POST /api/invites/accept',
    'POST /api/pairings/claim-household-device',
  ]);
});
