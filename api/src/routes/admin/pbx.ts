/**
 * src/routes/admin/pbx.ts
 *
 * Admin routes for managing PBX credentials (per tenant).
 * All routes require: valid session + manager or admin role.
 *
 * GET    /admin/pbx        — list PBX credentials for tenant
 * POST   /admin/pbx        — add PBX (validates connectivity, encrypts credentials)
 * PUT    /admin/pbx/:id    — update PBX credentials
 * DELETE /admin/pbx/:id    — soft-delete (set is_active = false)
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { pbxCredentials } from '../../db/schema.js';
import { requireAuth, requireRole } from '../../middleware/requireAuth.js';
import { encrypt } from '../../utils/encrypt.js';
import { createPbxSchema, updatePbxSchema } from '../../utils/validate.js';
import { validatePbxConnectivity } from '../../utils/pbx.js';

// ── Route plugin ──────────────────────────────────────────────────────────────

export async function adminPbxRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  // ── GET /admin/pbx ─────────────────────────────────────────────────────────

  fastify.get('/admin/pbx', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const session = request.session!;
    const tenantId = (request.query as { tenantId?: string }).tenantId ?? session.tenantId;
    if (session.role !== 'admin' && !tenantId) {
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

  // ── POST /admin/pbx ────────────────────────────────────────────────────────

  fastify.post('/admin/pbx', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const session = request.session!;
    const tenantId = (request.query as { tenantId?: string }).tenantId ?? session.tenantId;
    if (session.role !== 'admin' && !tenantId) {
      return reply.code(400).send({ error: 'MISSING_TENANT' });
    }
    if (!tenantId) {
      return reply.code(400).send({ error: 'MISSING_TENANT', message: 'tenantId required for PBX creation' });
    }

    const parseResult = createPbxSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: parseResult.error.message });
    }
    const { fqdn, name, authMode, credentials } = parseResult.data;

    // Validate connectivity before saving
    try {
      const credFields =
        credentials.mode === 'xapi'
          ? { clientId: credentials.clientId, secret: credentials.secret }
          : { username: credentials.username, password: credentials.password };
      await validatePbxConnectivity(fqdn, authMode, credFields);
    } catch (e: unknown) {
      const err = e as { statusCode?: number; code?: string; message?: string };
      return reply.code(err.statusCode ?? 422).send({
        error: err.code ?? 'PBX_UNAVAILABLE',
        message: err.message,
      });
    }

    // Encrypt credentials before storing
    const db = getDb();
    const values: typeof pbxCredentials.$inferInsert = {
      tenantId,
      pbxFqdn: fqdn,
      pbxName: name,
      authMode,
      ...(credentials.mode === 'xapi'
        ? {
            xapiClientId: encrypt(credentials.clientId),
            xapiSecret: encrypt(credentials.secret),
          }
        : {
            pbxUsername: encrypt(credentials.username),
            pbxPassword: encrypt(credentials.password),
          }),
    };

    const created = await db.insert(pbxCredentials).values(values).returning();
    return reply.code(201).send({ pbx: created[0] });
  });

  // ── PUT /admin/pbx/:id ─────────────────────────────────────────────────────

  fastify.put('/admin/pbx/:id', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const session = request.session!;
    const tenantId = (request.query as { tenantId?: string }).tenantId ?? session.tenantId;
    if (session.role !== 'admin' && !tenantId) {
      return reply.code(400).send({ error: 'MISSING_TENANT' });
    }

    const { id } = request.params as { id: string };
    const parseResult = updatePbxSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: parseResult.error.message });
    }
    const { name, credentials, isActive } = parseResult.data;

    const db = getDb();
    // Ensure the PBX belongs to this tenant (or admin sees all)
    const conditions = [eq(pbxCredentials.id, id)];
    if (tenantId) conditions.push(eq(pbxCredentials.tenantId, tenantId));

    const existing = await db
      .select({ id: pbxCredentials.id, pbxFqdn: pbxCredentials.pbxFqdn, authMode: pbxCredentials.authMode })
      .from(pbxCredentials)
      .where(and(...conditions))
      .limit(1);

    if (!existing[0]) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    const updates: Partial<typeof pbxCredentials.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updates.pbxName = name;
    if (isActive !== undefined) updates.isActive = isActive;
    if (credentials) {
      if (credentials.mode === 'xapi') {
        updates.xapiClientId = encrypt(credentials.clientId);
        updates.xapiSecret = encrypt(credentials.secret);
      } else {
        updates.pbxUsername = encrypt(credentials.username);
        updates.pbxPassword = encrypt(credentials.password);
      }
    }

    const updated = await db
      .update(pbxCredentials)
      .set(updates)
      .where(eq(pbxCredentials.id, id))
      .returning();

    return reply.send({ pbx: updated[0] });
  });

  // ── DELETE /admin/pbx/:id ──────────────────────────────────────────────────

  fastify.delete('/admin/pbx/:id', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const session = request.session!;
    const tenantId = (request.query as { tenantId?: string }).tenantId ?? session.tenantId;
    if (session.role !== 'admin' && !tenantId) {
      return reply.code(400).send({ error: 'MISSING_TENANT' });
    }

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

    return reply.code(204).send();
  });
}
