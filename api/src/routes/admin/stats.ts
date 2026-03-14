/**
 * src/routes/admin/stats.ts
 *
 * GET /admin/stats — dashboard aggregations (tenant-scoped).
 * Returns PBX counts, runner counts, switches today, top runners,
 * top departments, and hourly activity.
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, sql, gte } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { runners, pbxCredentials, auditLog } from '../../db/schema.js';
import { requireAuth, requireRole } from '../../middleware/requireAuth.js';

// ── Route plugin ──────────────────────────────────────────────────────────────

export async function adminStatsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/admin/stats', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const session = request.session!;
    const tenantId = (request.query as { tenantId?: string }).tenantId ?? session.tenantId;
    if (session.role !== 'admin' && !tenantId) {
      return reply.code(400).send({ error: 'MISSING_TENANT' });
    }

    const db = getDb();
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Build tenant condition (admin without tenantId sees all)
    const pbxTenantCond = tenantId ? [eq(pbxCredentials.tenantId, tenantId)] : [];
    const runnerTenantCond = tenantId ? [eq(runners.tenantId, tenantId)] : [];

    // 1. PBX counts (total, active)
    const pbxCounts = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${pbxCredentials.isActive} = true)::int`,
      })
      .from(pbxCredentials)
      .where(pbxTenantCond.length > 0 ? and(...pbxTenantCond) : undefined);

    // 2. Runner counts (total, active)
    const runnerCounts = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${runners.isActive} = true)::int`,
      })
      .from(runners)
      .where(runnerTenantCond.length > 0 ? and(...runnerTenantCond) : undefined);

    // 3. Switches today (last 24h, tenant-scoped via runners join)
    const switchConditions = [gte(auditLog.createdAt, oneDayAgo), ...runnerTenantCond];
    const switchesToday = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLog)
      .innerJoin(runners, eq(auditLog.runnerId, runners.id))
      .where(and(...switchConditions));

    // 4. Top 5 runners by switch count (last 7 days)
    const topConditions = [gte(auditLog.createdAt, sevenDaysAgo), ...runnerTenantCond];
    const topRunners = await db
      .select({
        runnerId: auditLog.runnerId,
        entraEmail: auditLog.entraEmail,
        pbxName: pbxCredentials.pbxName,
        count: sql<number>`count(*)::int`,
      })
      .from(auditLog)
      .innerJoin(runners, eq(auditLog.runnerId, runners.id))
      .innerJoin(pbxCredentials, eq(runners.pbxCredentialId, pbxCredentials.id))
      .where(and(...topConditions))
      .groupBy(auditLog.runnerId, auditLog.entraEmail, pbxCredentials.pbxName)
      .orderBy(sql`count(*) desc`)
      .limit(5);

    // 5. Top 5 departments by switch count (last 7 days)
    const topDepartments = await db
      .select({
        toDeptId: auditLog.toDeptId,
        toDeptName: auditLog.toDeptName,
        pbxName: pbxCredentials.pbxName,
        count: sql<number>`count(*)::int`,
      })
      .from(auditLog)
      .innerJoin(runners, eq(auditLog.runnerId, runners.id))
      .innerJoin(pbxCredentials, eq(runners.pbxCredentialId, pbxCredentials.id))
      .where(and(...topConditions))
      .groupBy(auditLog.toDeptId, auditLog.toDeptName, pbxCredentials.pbxName)
      .orderBy(sql`count(*) desc`)
      .limit(5);

    // 6. Hourly activity (last 24h)
    const hourlyActivity = await db
      .select({
        hour: sql<string>`date_trunc('hour', ${auditLog.createdAt})::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(auditLog)
      .innerJoin(runners, eq(auditLog.runnerId, runners.id))
      .where(and(...switchConditions))
      .groupBy(sql`date_trunc('hour', ${auditLog.createdAt})`)
      .orderBy(sql`date_trunc('hour', ${auditLog.createdAt})`);

    return reply.send({
      pbx: pbxCounts[0] ?? { total: 0, active: 0 },
      runners: runnerCounts[0] ?? { total: 0, active: 0 },
      switchesToday: switchesToday[0]?.count ?? 0,
      topRunners,
      topDepartments,
      hourlyActivity,
    });
  });
}
