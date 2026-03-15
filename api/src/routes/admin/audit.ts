/**
 * src/routes/admin/audit.ts
 *
 * Admin audit log routes (tenant-scoped via runners join).
 *
 * GET /admin/audit        — paginated, filtered audit log
 * GET /admin/audit/export — CSV download of filtered audit log
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, sql, gte, lte } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { runners, auditLog } from '../../db/schema.js';
import { requireAuth, requireRole } from '../../middleware/requireAuth.js';

interface AuditQuery {
  tenantId?: string;
  page?: string;
  limit?: string;
  from?: string;
  to?: string;
  pbx?: string;
  status?: string;
  email?: string;
}

function buildAuditConditions(tenantId: string | null, query: AuditQuery) {
  const conditions = [];
  if (tenantId) conditions.push(eq(runners.tenantId, tenantId));

  if (query.from) {
    const fromDate = new Date(query.from);
    if (!isNaN(fromDate.getTime())) {
      conditions.push(gte(auditLog.createdAt, fromDate));
    }
  }
  if (query.to) {
    const toDate = new Date(query.to);
    if (!isNaN(toDate.getTime())) {
      conditions.push(lte(auditLog.createdAt, toDate));
    }
  }
  if (query.pbx) {
    conditions.push(eq(auditLog.pbxFqdn, query.pbx));
  }
  if (query.status) {
    conditions.push(eq(auditLog.status, query.status));
  }
  if (query.email) {
    conditions.push(eq(auditLog.entraEmail, query.email));
  }

  return conditions;
}

// ── Route plugin ──────────────────────────────────────────────────────────────

export async function adminAuditRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  // ── GET /admin/audit ────────────────────────────────────────────────────────

  fastify.get('/admin/audit', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const session = request.session!;
    const query = request.query as AuditQuery;
    const tenantId = query.tenantId ?? session.tenantId;
    if (session.role !== 'super_admin' && !tenantId) {
      return reply.code(400).send({ error: 'MISSING_TENANT' });
    }

    const db = getDb();
    const conditions = buildAuditConditions(tenantId, query);

    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '25', 10)));
    const offset = (page - 1) * limit;

    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLog)
      .innerJoin(runners, eq(auditLog.runnerId, runners.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    const total = countResult[0]?.count ?? 0;

    const logs = await db
      .select({
        id: auditLog.id,
        runnerId: auditLog.runnerId,
        entraEmail: auditLog.entraEmail,
        pbxFqdn: auditLog.pbxFqdn,
        extensionNumber: auditLog.extensionNumber,
        fromDeptId: auditLog.fromDeptId,
        fromDeptName: auditLog.fromDeptName,
        toDeptId: auditLog.toDeptId,
        toDeptName: auditLog.toDeptName,
        status: auditLog.status,
        errorMessage: auditLog.errorMessage,
        ipAddress: auditLog.ipAddress,
        userAgent: auditLog.userAgent,
        deviceId: auditLog.deviceId,
        durationMs: auditLog.durationMs,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .innerJoin(runners, eq(auditLog.runnerId, runners.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(sql`${auditLog.createdAt} desc`)
      .limit(limit)
      .offset(offset);

    return reply.send({ logs, total, page, pages: Math.ceil(total / limit) });
  });

  // ── GET /admin/audit/export ─────────────────────────────────────────────────

  fastify.get('/admin/audit/export', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const session = request.session!;
    const query = request.query as AuditQuery;
    const tenantId = query.tenantId ?? session.tenantId;
    if (session.role !== 'super_admin' && !tenantId) {
      return reply.code(400).send({ error: 'MISSING_TENANT' });
    }

    const db = getDb();
    const conditions = buildAuditConditions(tenantId, query);

    const logs = await db
      .select({
        id: auditLog.id,
        entraEmail: auditLog.entraEmail,
        pbxFqdn: auditLog.pbxFqdn,
        extensionNumber: auditLog.extensionNumber,
        fromDeptId: auditLog.fromDeptId,
        fromDeptName: auditLog.fromDeptName,
        toDeptId: auditLog.toDeptId,
        toDeptName: auditLog.toDeptName,
        status: auditLog.status,
        errorMessage: auditLog.errorMessage,
        ipAddress: auditLog.ipAddress,
        durationMs: auditLog.durationMs,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .innerJoin(runners, eq(auditLog.runnerId, runners.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(sql`${auditLog.createdAt} desc`);

    // Build CSV
    const headers = [
      'id', 'entraEmail', 'pbxFqdn', 'extensionNumber',
      'fromDeptId', 'fromDeptName', 'toDeptId', 'toDeptName',
      'status', 'errorMessage', 'ipAddress', 'durationMs', 'createdAt',
    ];

    const escapeCsv = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvLines = [headers.join(',')];
    for (const log of logs) {
      const row = headers.map((h) => escapeCsv((log as Record<string, unknown>)[h]));
      csvLines.push(row.join(','));
    }

    const csv = csvLines.join('\n');

    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', 'attachment; filename="audit-log.csv"')
      .send(csv);
  });
}
