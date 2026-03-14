/**
 * src/routes/admin/tenants.ts
 *
 * Admin self-service routes for tenant configuration.
 * All routes require: valid admin session + admin_emails membership check.
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
import { adminAuthenticate } from '../../middleware/authenticate.js';
import { createSessionToken } from '../../middleware/session.js';
import type { AdminSession } from '../../middleware/session.js';
import { updateTenantSchema } from '../../utils/validate.js';

export async function adminTenantRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // Apply admin authentication to all routes in this plugin
  fastify.addHook('preHandler', adminAuthenticate);

  // ── GET /admin/tenants/me ──────────────────────────────────────────────────

  fastify.get('/admin/tenants/me', async (request, reply) => {
    const adminSession = request.adminSession!;
    const db = getDb();

    let tenantRow: typeof tenants.$inferSelect | undefined;

    // If tenantId is set, look up directly (subsequent logins with session JWT)
    if (adminSession.tenantId) {
      const rows = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, adminSession.tenantId))
        .limit(1);
      tenantRow = rows[0];
    } else {
      // First login: look up by Entra tenant ID (from Microsoft ID token)
      const rows = await db
        .select()
        .from(tenants)
        .where(eq(tenants.entraTenantId, adminSession.tid!))
        .limit(1);
      tenantRow = rows[0];

      if (!tenantRow) {
        // Auto-create tenant row on first admin login
        const created = await db
          .insert(tenants)
          .values({
            entraTenantId: adminSession.tid!,
            name: `Tenant ${adminSession.tid}`,
            entraGroupId: '', // admin must update via PUT /admin/tenants/me
            adminEmails: [adminSession.entraEmail!],
            isActive: true,
          })
          .returning();
        tenantRow = created[0];
      }
    }

    if (!tenantRow) {
      return reply.code(404).send({ error: 'TENANT_NOT_REGISTERED' });
    }

    // Check admin_emails membership
    if (!tenantRow.adminEmails.includes(adminSession.entraEmail!)) {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }

    // Issue a fresh admin session JWT with the resolved tenantId
    const newSession: AdminSession = {
      type: 'session',
      userId: adminSession.userId ?? '',
      email: adminSession.entraEmail ?? adminSession.email,
      role: 'admin',
      tenantId: tenantRow.id,
      runnerId: null,
      emailVerified: true,
      pbxFqdn: null,
      extensionNumber: null,
      entraEmail: adminSession.entraEmail,
      tid: adminSession.tid || tenantRow.entraTenantId,
      oid: adminSession.oid,
    };
    const sessionToken = createSessionToken(newSession);

    return reply.send({ tenant: tenantRow, sessionToken });
  });

  // ── PUT /admin/tenants/me ──────────────────────────────────────────────────

  fastify.put('/admin/tenants/me', async (request, reply) => {
    const adminSession = request.adminSession!;
    if (!adminSession.tenantId) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Use GET /admin/tenants/me first to bootstrap' });
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

    // Verify tenant exists and caller is an admin
    const rows = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, adminSession.tenantId))
      .limit(1);

    const tenantRow = rows[0];
    if (!tenantRow) {
      return reply.code(404).send({ error: 'TENANT_NOT_REGISTERED' });
    }
    if (!tenantRow.adminEmails.includes(adminSession.entraEmail!)) {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }

    const updated = await db
      .update(tenants)
      .set({
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.entraGroupId !== undefined && { entraGroupId: updates.entraGroupId }),
        updatedAt: sql`now()`,
      })
      .where(eq(tenants.id, adminSession.tenantId))
      .returning();

    return reply.send({ tenant: updated[0] });
  });
}
