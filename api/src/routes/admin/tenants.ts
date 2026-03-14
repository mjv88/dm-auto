/**
 * src/routes/admin/tenants.ts
 *
 * Admin self-service routes for tenant configuration.
 * All routes require: valid session + manager or admin role.
 *
 * GET  /admin/tenants/me — get current tenant config (auto-creates on first login)
 * PUT  /admin/tenants/me — update tenant (entra_group_id, name)
 *
 * "First admin login" bootstrap:
 *   If the Authorization header carries a Microsoft ID token (not a session JWT),
 *   adminAuthenticate sets request.adminSession.tenantId = '' and the route
 *   looks up or creates the tenant row by tid.
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { tenants } from '../../db/schema.js';
import { requireAuth, requireRole } from '../../middleware/requireAuth.js';
import { createSessionToken } from '../../middleware/session.js';
import type { UnifiedSession } from '../../middleware/session.js';
import { updateTenantSchema } from '../../utils/validate.js';

export async function adminTenantRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // Apply auth to all routes in this plugin
  fastify.addHook('preHandler', requireAuth);

  // ── GET /admin/tenants/me ──────────────────────────────────────────────────

  fastify.get('/admin/tenants/me', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const session = request.session!;
    const tenantId = (request.query as { tenantId?: string }).tenantId ?? session.tenantId;
    const db = getDb();

    let tenantRow: typeof tenants.$inferSelect | undefined;

    // If tenantId is set, look up directly (subsequent logins with session JWT)
    if (tenantId) {
      const rows = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      tenantRow = rows[0];
    } else if (session.tid) {
      // First login: look up by Entra tenant ID (from Microsoft ID token)
      const rows = await db
        .select()
        .from(tenants)
        .where(eq(tenants.entraTenantId, session.tid))
        .limit(1);
      tenantRow = rows[0];

      if (!tenantRow) {
        // Auto-create tenant row on first admin login
        const created = await db
          .insert(tenants)
          .values({
            entraTenantId: session.tid,
            name: `Tenant ${session.tid}`,
            entraGroupId: '', // admin must update via PUT /admin/tenants/me
            adminEmails: [session.entraEmail ?? session.email],
            isActive: true,
          })
          .returning();
        tenantRow = created[0];
      }
    }

    if (!tenantRow) {
      return reply.code(404).send({ error: 'TENANT_NOT_REGISTERED' });
    }

    // Issue a fresh session JWT with the resolved tenantId
    const newSession: UnifiedSession = {
      type: 'session',
      userId: session.userId ?? '',
      email: session.entraEmail ?? session.email,
      role: session.role,
      tenantId: tenantRow.id,
      runnerId: null,
      emailVerified: true,
      pbxFqdn: null,
      extensionNumber: null,
      entraEmail: session.entraEmail,
      tid: session.tid || tenantRow.entraTenantId,
      oid: session.oid,
    };
    const sessionToken = createSessionToken(newSession);

    return reply.send({ tenant: tenantRow, sessionToken });
  });

  // ── PUT /admin/tenants/me ──────────────────────────────────────────────────

  fastify.put('/admin/tenants/me', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const session = request.session!;
    const tenantId = (request.query as { tenantId?: string }).tenantId ?? session.tenantId;
    if (session.role !== 'admin' && !tenantId) {
      return reply.code(400).send({ error: 'MISSING_TENANT' });
    }

    const parseResult = updateTenantSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: parseResult.error.message,
      });
    }
    const updates = parseResult.data;

    const db = getDb();

    // Verify tenant exists
    const rows = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId!))
      .limit(1);

    const tenantRow = rows[0];
    if (!tenantRow) {
      return reply.code(404).send({ error: 'TENANT_NOT_REGISTERED' });
    }

    const updated = await db
      .update(tenants)
      .set({
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.entraGroupId !== undefined && { entraGroupId: updates.entraGroupId }),
        updatedAt: sql`now()`,
      })
      .where(eq(tenants.id, tenantId!))
      .returning();

    return reply.send({ tenant: updated[0] });
  });
}
