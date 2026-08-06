import type { FastifyInstance } from 'fastify';
import { latestRelease } from './appReleases.js';
import { sql } from './db.js';
import { metricsAuthorized, renderMetrics } from './observability.js';

export function registerOperationalRoutes(app: FastifyInstance) {
  /**
   * Public release metadata for update discovery. Unauthenticated because a local-only
   * install has no session, and it exposes nothing that is not already public on the
   * releases page — no service, database, or deployment detail.
   */
  app.get('/api/meta', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async () => {
    const release = await latestRelease();
    return {
      latest: release && {
        version: release.version,
        releaseUrl: release.releaseUrl,
        downloadUrl: release.downloadUrl,
        publishedAt: release.publishedAt,
      },
    };
  });

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
