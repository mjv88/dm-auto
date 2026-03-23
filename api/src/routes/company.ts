/**
 * src/routes/company.ts
 *
 * Public company endpoint for the self-service onboarding flow.
 *   GET /company/:tenantId/name — returns the company name (no auth required)
 */

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { tenants } from '../db/schema.js';

export async function companyRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /company/:tenantId/name ─────────────────────────────────────────────

  fastify.get('/company/:tenantId/name', { config: { rateLimit: { max: 30, timeWindow: 60_000 } } }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };

    const db = getDb();
    const rows = await db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Company not found' });
    }

    return reply.send({ name: row.name });
  });
}
