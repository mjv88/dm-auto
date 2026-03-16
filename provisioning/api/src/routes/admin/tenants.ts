/**
 * src/routes/admin/tenants.ts
 *
 * Admin routes for tenant configuration.
 *
 * GET  /admin/tenants/me — get current tenant config
 * PUT  /admin/tenants/me — update tenant name
 */

import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { tenants } from '../../db/schema.js';
import { requireAuth, requireRole } from '../../middleware/requireAuth.js';

export async function adminTenantRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  // GET /admin/tenants/me
  fastify.get('/admin/tenants/me', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const session = request.session!;
    const tenantId = (request.query as { tenantId?: string }).tenantId ?? session.tenantId;
    const db = getDb();

    if (!tenantId) {
      // Super admin: return all tenants
      if (session.role === 'super_admin') {
        const allTenants = await db.select().from(tenants);
        return reply.send({ tenants: allTenants });
      }
      return reply.code(400).send({ error: 'MISSING_TENANT' });
    }

    const rows = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!rows[0]) {
      return reply.code(404).send({ error: 'TENANT_NOT_REGISTERED' });
    }

    return reply.send({ tenant: rows[0] });
  });

  // PUT /admin/tenants/me
  fastify.put('/admin/tenants/me', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const session = request.session!;
    const tenantId = (request.query as { tenantId?: string }).tenantId ?? session.tenantId;
    if (!tenantId) {
      return reply.code(400).send({ error: 'MISSING_TENANT' });
    }

    const body = request.body as { name?: string };
    const db = getDb();

    const rows = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!rows[0]) {
      return reply.code(404).send({ error: 'TENANT_NOT_REGISTERED' });
    }

    const updated = await db
      .update(tenants)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        updatedAt: sql`now()`,
      })
      .where(eq(tenants.id, tenantId))
      .returning();

    return reply.send({ tenant: updated[0] });
  });
}
