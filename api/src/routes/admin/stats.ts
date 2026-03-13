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
import { tenants, runners, pbxCredentials, auditLog } from '../../db/schema.js';
import { adminAuthenticate } from '../../middleware/authenticate.js';

// ── Helper ────────────────────────────────────────────────────────────────────

async function assertAdmin(adminEmail: string, tenantId: string): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ adminEmails: tenants.adminEmails })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const row = rows[0];
  if (!row || !row.adminEmails.includes(adminEmail)) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403, code: 'FORBIDDEN' });
  }
}

// ── Route plugin ──────────────────────────────────────────────────────────────

export async function adminStatsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', adminAuthenticate);

  fastify.get('/admin/stats', async (request, reply) => {
    const { tenantId, entraEmail } = request.adminSession!;
    if (!tenantId) return reply.code(401).send({ error: 'UNAUTHORIZED' });

    try { await assertAdmin(entraEmail, tenantId); } catch (e: unknown) {
      const err = e as { statusCode?: number; code?: string };
      return reply.code(err.statusCode ?? 403).send({ error: err.code ?? 'FORBIDDEN' });
    }

    const db = getDb();
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 1. PBX counts (total, active)
    const pbxCounts = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${pbxCredentials.isActive} = true)::int`,
      })
      .from(pbxCredentials)
      .where(eq(pbxCredentials.tenantId, tenantId));

    // 2. Runner counts (total, active)
    const runnerCounts = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${runners.isActive} = true)::int`,
      })
      .from(runners)
      .where(eq(runners.tenantId, tenantId));

    // 3. Switches today (last 24h, tenant-scoped via runners join)
    const switchesToday = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLog)
      .innerJoin(runners, eq(auditLog.runnerId, runners.id))
      .where(
        and(
          eq(runners.tenantId, tenantId),
          gte(auditLog.createdAt, oneDayAgo),
        ),
      );

    // 4. Top 5 runners by switch count (last 7 days)
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
      .where(
        and(
          eq(runners.tenantId, tenantId),
          gte(auditLog.createdAt, sevenDaysAgo),
        ),
      )
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
      .where(
        and(
          eq(runners.tenantId, tenantId),
          gte(auditLog.createdAt, sevenDaysAgo),
        ),
      )
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
      .where(
        and(
          eq(runners.tenantId, tenantId),
          gte(auditLog.createdAt, oneDayAgo),
        ),
      )
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
