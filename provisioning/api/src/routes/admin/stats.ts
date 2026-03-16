import type { FastifyInstance } from 'fastify';
import { eq, sql, count, and } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { pbxExtensions, pbxCredentials } from '../../db/schema.js';
import { requireAuth, requireRole } from '../../middleware/requireAuth.js';

export async function statsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /admin/stats — return counts
  fastify.get(
    '/admin/stats',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (request, reply) => {
      const session = request.session!;
      const db = getDb();

      // Build tenant filter
      let pbxIdFilter: string[] | null = null;
      if (session.tenantId) {
        const pbxRows = await db
          .select({ id: pbxCredentials.id })
          .from(pbxCredentials)
          .where(eq(pbxCredentials.tenantId, session.tenantId));
        pbxIdFilter = pbxRows.map((r) => r.id);
        if (pbxIdFilter.length === 0) {
          return reply.send({ total: 0, provisioned: 0, pending: 0, errors: 0 });
        }
      }

      const tenantCondition = pbxIdFilter
        ? sql`${pbxExtensions.pbxCredentialId} IN (${sql.join(pbxIdFilter.map(id => sql`${id}`), sql`, `)})`
        : undefined;

      const [totalResult, provisionedResult, pendingResult, errorResult] = await Promise.all([
        db.select({ count: count() }).from(pbxExtensions).where(tenantCondition),
        db.select({ count: count() }).from(pbxExtensions).where(
          tenantCondition
            ? and(tenantCondition, sql`${pbxExtensions.provisioningStatus} IN ('fetched', 'delivered')`)
            : sql`${pbxExtensions.provisioningStatus} IN ('fetched', 'delivered')`,
        ),
        db.select({ count: count() }).from(pbxExtensions).where(
          tenantCondition
            ? and(tenantCondition, eq(pbxExtensions.provisioningStatus, 'pending'))
            : eq(pbxExtensions.provisioningStatus, 'pending'),
        ),
        db.select({ count: count() }).from(pbxExtensions).where(
          tenantCondition
            ? and(tenantCondition, eq(pbxExtensions.provisioningStatus, 'error'))
            : eq(pbxExtensions.provisioningStatus, 'error'),
        ),
      ]);

      return reply.send({
        total: totalResult[0]?.count ?? 0,
        provisioned: provisionedResult[0]?.count ?? 0,
        pending: pendingResult[0]?.count ?? 0,
        errors: errorResult[0]?.count ?? 0,
      });
    },
  );
}
