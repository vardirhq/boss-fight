import 'dotenv/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { runOperationalRetention } from './retention.js';
import { apiSecurityHeaders, configuredCorsOrigins, trustProxyEnabled } from './apiSecurity.js';
import { recordRequest } from './observability.js';
import { installApiErrorHandler } from './apiErrors.js';
import { registerOperationalRoutes } from './operationalRoutes.js';
import { registerGameplayRoutes } from './gameplayRoutes.js';
import { registerInvitationRoutes } from './invitationRoutes.js';
import { registerSyncPullRoutes } from './syncPullRoutes.js';
import { registerSyncPushRoutes } from './syncPushRoutes.js';
import { registerAuthAccountRoutes } from './authAccountRoutes.js';
import { requireAuth } from './authentication.js';
import {
  assertHouseholdRow, assertNullableHouseholdRow, requireHouseholdMember,
  requireHouseholdPrincipal, requireHouseholdRole,
} from './householdAccess.js';
import { registerHouseholdRoutes } from './householdRoutes.js';
import { entityId } from './entityIds.js';
import { decorateBosses, serverBossAvailable, serverBossElite, serverCycleKey } from './bossSchedule.js';

export async function buildApp() {
  const production = process.env.NODE_ENV === 'production';
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    trustProxy: trustProxyEnabled(process.env.TRUST_PROXY),
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });

  await app.register(cors, {
    origin: configuredCorsOrigins(process.env.CORS_ORIGIN, production),
  });

  app.addHook('onSend', async (request, reply) => {
    for (const [name, value] of Object.entries(apiSecurityHeaders)) reply.header(name, value);
    reply.header('x-request-id', request.id);
  });

  app.addHook('onResponse', async (request, reply) => {
    recordRequest(request.method, request.routeOptions.url ?? 'unmatched', reply.statusCode);
  });

  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 300),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? '1 minute'
  });

  installApiErrorHandler(app);
  registerOperationalRoutes(app);
  registerAuthAccountRoutes(app);
  registerHouseholdRoutes(app, { entityId, decorateBosses });
  registerInvitationRoutes(app, { requireAuth, requireHouseholdRole, assertHouseholdRow, entityId });
  registerGameplayRoutes(app, { requireAuth, requireHouseholdRole, assertHouseholdRow });
  registerSyncPullRoutes(app, { requireHouseholdPrincipal, decorateBosses });
  registerSyncPushRoutes(app, {
    requireHouseholdPrincipal, requireHouseholdMember, requireHouseholdRole, assertHouseholdRow,
    assertNullableHouseholdRow, entityId, serverCycleKey, serverBossAvailable, serverBossElite,
  });

  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const app = await buildApp();
  const initialRetention = await runOperationalRetention();
  app.log.info({ removed: initialRetention }, 'operational retention cleanup completed');
  await app.listen({ port: Number(process.env.PORT ?? 3002), host: '0.0.0.0' });
  const retentionTimer = setInterval(() => {
    void runOperationalRetention()
      .then((removed) => app.log.info({ removed }, 'operational retention cleanup completed'))
      .catch((error) => app.log.error({ error }, 'operational retention cleanup failed'));
  }, 24 * 60 * 60 * 1000);
  retentionTimer.unref();
}
