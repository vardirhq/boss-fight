import type { FastifyInstance } from 'fastify';
import { sql } from './db.js';
import { metricsAuthorized, renderMetrics } from './observability.js';

export function registerOperationalRoutes(app: FastifyInstance) {
  app.get('/metrics', async (request, reply) => {
    if (!metricsAuthorized(process.env.METRICS_TOKEN, request.headers.authorization)) {
      reply.code(404).send({ error: 'Not found', code: 'not_found' });
      return;
    }
    reply.type('text/plain; version=0.0.4').send(renderMetrics());
  });

  app.get('/health', async () => {
    await sql`select 1`;
    return { ok: true };
  });
}
