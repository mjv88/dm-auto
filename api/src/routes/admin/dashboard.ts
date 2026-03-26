import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { dashboardState, auditLog } from '../../db/schema.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { writeAuditLog } from '../../middleware/audit.js';

export async function dashboardRoutes(fastify: FastifyInstance): Promise<void> {

  // GET /admin/dashboard/state/:id — load saved state
  fastify.get('/admin/dashboard/state/:id', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const rows = await db
      .select()
      .from(dashboardState)
      .where(eq(dashboardState.id, id))
      .limit(1);

    if (!rows[0]) {
      return reply.send({ state: null });
    }

    return reply.send({ state: rows[0].state, updatedBy: rows[0].updatedBy, updatedAt: rows[0].updatedAt });
  });

  // PUT /admin/dashboard/state/:id — save state + audit
  fastify.put('/admin/dashboard/state/:id', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = request.session!;
    const body = request.body as { state: Record<string, unknown>; changes?: Array<{ field: string; oldValue: unknown; newValue: unknown }> };

    const db = getDb();
    const email = session.email ?? 'unknown';

    // Upsert the state
    await db
      .insert(dashboardState)
      .values({
        id,
        state: body.state,
        updatedBy: email,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: dashboardState.id,
        set: {
          state: body.state,
          updatedBy: email,
          updatedAt: new Date(),
        },
      });

    // Write audit entry if changes provided
    if (body.changes && body.changes.length > 0) {
      writeAuditLog(request, {
        runnerId: session.userId ?? session.runnerId ?? '00000000-0000-0000-0000-000000000000',
        entraEmail: email,
        pbxFqdn: '',
        extensionNumber: '',
        fromDeptId: null,
        fromDeptName: null,
        toDeptId: null,
        toDeptName: null,
        status: 'success',
        errorCode: null,
        durationMs: 0,
        action: 'dashboard_state_changed',
        metadata: {
          dashboardId: id,
          changes: body.changes,
          changedBy: email,
        },
      });
    }

    return reply.send({ success: true });
  });

  // GET /admin/dashboard/audit/:id — change log (restricted to info@tcx-hub.com / super_admin)
  fastify.get('/admin/dashboard/audit/:id', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const session = request.session!;

    // Only info@tcx-hub.com or super_admin can see audit
    if (session.email !== 'info@tcx-hub.com' && session.role !== 'super_admin') {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }

    const { id } = request.params as { id: string };
    const db = getDb();

    // Query audit_log for dashboard changes
    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'dashboard_state_changed'))
      .orderBy(sql`${auditLog.createdAt} desc`)
      .limit(100);

    // Filter to this dashboard ID from metadata
    const filtered = rows.filter((r: any) => {
      const meta = r.metadata as Record<string, unknown> | null;
      return meta?.dashboardId === id;
    });

    return reply.send({ entries: filtered });
  });
}
