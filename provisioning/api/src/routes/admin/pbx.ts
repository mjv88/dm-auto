/**
 * src/routes/admin/pbx.ts
 *
 * Admin routes for managing PBX credentials (per tenant).
 * Simplified from Runner App — no runner-specific logic.
 *
 * GET    /admin/pbx        — list PBX credentials for tenant
 * POST   /admin/pbx        — add PBX
 * PUT    /admin/pbx/:id    — update PBX credentials
 * DELETE /admin/pbx/:id    — soft-delete (set is_active = false)
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { pbxCredentials, auditLog } from '../../db/schema.js';
import { requireAuth, requireRole } from '../../middleware/requireAuth.js';
import { encrypt } from '../../utils/encrypt.js';

export async function adminPbxRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  // GET /admin/pbx
  fastify.get('/admin/pbx', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const session = request.session!;
    const tenantId = (request.query as { tenantId?: string }).tenantId ?? session.tenantId;
    if (session.role !== 'super_admin' && !tenantId) {
      return reply.code(400).send({ error: 'MISSING_TENANT' });
    }

    const db = getDb();
    const conditions = tenantId ? [eq(pbxCredentials.tenantId, tenantId)] : [];

    const rows = await db
      .select({
        id: pbxCredentials.id,
        pbxFqdn: pbxCredentials.pbxFqdn,
        pbxName: pbxCredentials.pbxName,
        authMode: pbxCredentials.authMode,
        isActive: pbxCredentials.isActive,
        createdAt: pbxCredentials.createdAt,
        updatedAt: pbxCredentials.updatedAt,
      })
      .from(pbxCredentials)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return reply.send({ pbxList: rows });
  });

  // POST /admin/pbx
  fastify.post('/admin/pbx', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const session = request.session!;
    const tenantId = (request.query as { tenantId?: string }).tenantId ?? session.tenantId;
    if (!tenantId) {
      return reply.code(400).send({ error: 'MISSING_TENANT', message: 'tenantId required for PBX creation' });
    }

    const body = request.body as {
      pbxFqdn: string;
      pbxName: string;
      authMode: string;
      xapiClientId?: string;
      xapiSecret?: string;
    };

    if (!body.pbxFqdn || !body.pbxName) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'pbxFqdn and pbxName are required' });
    }

    const db = getDb();
    const values: typeof pbxCredentials.$inferInsert = {
      tenantId,
      pbxFqdn: body.pbxFqdn,
      pbxName: body.pbxName,
      authMode: body.authMode ?? 'xapi',
      ...(body.xapiClientId ? { xapiClientId: encrypt(body.xapiClientId) } : {}),
      ...(body.xapiSecret ? { xapiSecret: encrypt(body.xapiSecret) } : {}),
    };

    const created = await db.insert(pbxCredentials).values(values).returning();

    await db.insert(auditLog).values({
      userEmail: session.email,
      action: 'pbx.created',
      targetType: 'pbx',
      targetId: created[0].id,
    });

    return reply.code(201).send({ pbx: created[0] });
  });

  // PUT /admin/pbx/:id
  fastify.put('/admin/pbx/:id', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const session = request.session!;
    const tenantId = (request.query as { tenantId?: string }).tenantId ?? session.tenantId;
    const { id } = request.params as { id: string };

    const db = getDb();
    const conditions = [eq(pbxCredentials.id, id)];
    if (tenantId) conditions.push(eq(pbxCredentials.tenantId, tenantId));

    const existing = await db
      .select({ id: pbxCredentials.id })
      .from(pbxCredentials)
      .where(and(...conditions))
      .limit(1);

    if (!existing[0]) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    const body = request.body as {
      pbxName?: string;
      isActive?: boolean;
      xapiClientId?: string;
      xapiSecret?: string;
    };

    const updates: Partial<typeof pbxCredentials.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.pbxName !== undefined) updates.pbxName = body.pbxName;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.xapiClientId) updates.xapiClientId = encrypt(body.xapiClientId);
    if (body.xapiSecret) updates.xapiSecret = encrypt(body.xapiSecret);

    const updated = await db
      .update(pbxCredentials)
      .set(updates)
      .where(eq(pbxCredentials.id, id))
      .returning();

    return reply.send({ pbx: updated[0] });
  });

  // DELETE /admin/pbx/:id
  fastify.delete('/admin/pbx/:id', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const session = request.session!;
    const tenantId = (request.query as { tenantId?: string }).tenantId ?? session.tenantId;
    const { id } = request.params as { id: string };

    const db = getDb();
    const conditions = [eq(pbxCredentials.id, id)];
    if (tenantId) conditions.push(eq(pbxCredentials.tenantId, tenantId));

    const existing = await db
      .select({ id: pbxCredentials.id })
      .from(pbxCredentials)
      .where(and(...conditions))
      .limit(1);

    if (!existing[0]) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    await db
      .update(pbxCredentials)
      .set({ isActive: false, updatedAt: sql`now()` })
      .where(eq(pbxCredentials.id, id));

    await db.insert(auditLog).values({
      userEmail: session.email,
      action: 'pbx.deleted',
      targetType: 'pbx',
      targetId: id,
    });

    return reply.code(204).send();
  });
}
