/**
 * src/routes/admin/runners.ts
 *
 * Admin routes for managing runner registrations (per tenant).
 * All routes require: valid admin session + admin_emails membership.
 *
 * GET    /admin/runners        — list runners (filterable by pbx, active, email)
 * POST   /admin/runners        — add runner (validates extension on PBX)
 * PUT    /admin/runners/:id    — update runner
 * DELETE /admin/runners/:id    — soft-delete (set is_active = false)
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { tenants, runners, pbxCredentials } from '../../db/schema.js';
import { adminAuthenticate } from '../../middleware/authenticate.js';
import { XAPIClient } from '../../xapi/client.js';
import { getXAPIToken } from '../../xapi/auth.js';
import { createRunnerSchema, updateRunnerSchema } from '../../utils/validate.js';

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

export async function adminRunnerRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', adminAuthenticate);

  // ── GET /admin/runners ─────────────────────────────────────────────────────

  fastify.get('/admin/runners', async (request, reply) => {
    const { tenantId, entraEmail } = request.adminSession!;
    if (!tenantId) return reply.code(401).send({ error: 'UNAUTHORIZED' });

    try { await assertAdmin(entraEmail, tenantId); } catch (e: unknown) {
      const err = e as { statusCode?: number; code?: string };
      return reply.code(err.statusCode ?? 403).send({ error: err.code ?? 'FORBIDDEN' });
    }

    const query = request.query as {
      pbxId?: string;
      active?: string;
      email?: string;
      page?: string;
      limit?: string;
    };

    const db = getDb();
    const conditions = [eq(runners.tenantId, tenantId)];

    if (query.pbxId) conditions.push(eq(runners.pbxCredentialId, query.pbxId));
    if (query.active !== undefined) conditions.push(eq(runners.isActive, query.active === 'true'));
    if (query.email) conditions.push(eq(runners.entraEmail, query.email));

    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '25', 10)));
    const offset = (page - 1) * limit;

    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(runners)
      .innerJoin(pbxCredentials, eq(runners.pbxCredentialId, pbxCredentials.id))
      .where(and(...conditions));
    const total = countResult[0]?.count ?? 0;

    const rows = await db
      .select({
        id: runners.id,
        entraEmail: runners.entraEmail,
        extensionNumber: runners.extensionNumber,
        allowedDeptIds: runners.allowedDeptIds,
        isActive: runners.isActive,
        pbxFqdn: pbxCredentials.pbxFqdn,
        pbxName: pbxCredentials.pbxName,
        pbxCredentialId: runners.pbxCredentialId,
        createdAt: runners.createdAt,
      })
      .from(runners)
      .innerJoin(pbxCredentials, eq(runners.pbxCredentialId, pbxCredentials.id))
      .where(and(...conditions))
      .limit(limit)
      .offset(offset);

    return reply.send({ runners: rows, total, page, pages: Math.ceil(total / limit) });
  });

  // ── POST /admin/runners ────────────────────────────────────────────────────

  fastify.post('/admin/runners', async (request, reply) => {
    const { tenantId, entraEmail } = request.adminSession!;
    if (!tenantId) return reply.code(401).send({ error: 'UNAUTHORIZED' });

    try { await assertAdmin(entraEmail, tenantId); } catch (e: unknown) {
      const err = e as { statusCode?: number; code?: string };
      return reply.code(err.statusCode ?? 403).send({ error: err.code ?? 'FORBIDDEN' });
    }

    const parseResult = createRunnerSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: parseResult.error.message });
    }
    const { email, extension, pbxId, allowedDeptIds } = parseResult.data;

    const db = getDb();

    // Ensure the PBX belongs to this tenant and is active
    const pbxRows = await db
      .select({ pbxFqdn: pbxCredentials.pbxFqdn })
      .from(pbxCredentials)
      .where(
        and(
          eq(pbxCredentials.id, pbxId),
          eq(pbxCredentials.tenantId, tenantId),
          eq(pbxCredentials.isActive, true),
        ),
      )
      .limit(1);

    if (!pbxRows[0]) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'PBX not found for this tenant' });
    }

    const { pbxFqdn } = pbxRows[0];

    // Validate extension exists on the PBX before saving
    try {
      const client = await XAPIClient.create(pbxFqdn);
      await client.getUserByNumber(extension);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      return reply.code(422).send({
        error: err.code ?? 'PBX_UNAVAILABLE',
        message: err.message ?? `Extension ${extension} not found on PBX`,
      });
    }

    // Persist the runner
    const created = await db
      .insert(runners)
      .values({
        tenantId,
        pbxCredentialId: pbxId,
        entraEmail: email,
        extensionNumber: extension,
        allowedDeptIds,
        isActive: true,
        createdBy: entraEmail,
      })
      .returning();

    return reply.code(201).send({ runner: created[0] });
  });

  // ── PUT /admin/runners/:id ─────────────────────────────────────────────────

  fastify.put('/admin/runners/:id', async (request, reply) => {
    const { tenantId, entraEmail } = request.adminSession!;
    if (!tenantId) return reply.code(401).send({ error: 'UNAUTHORIZED' });

    try { await assertAdmin(entraEmail, tenantId); } catch (e: unknown) {
      const err = e as { statusCode?: number; code?: string };
      return reply.code(err.statusCode ?? 403).send({ error: err.code ?? 'FORBIDDEN' });
    }

    const { id } = request.params as { id: string };
    const parseResult = updateRunnerSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: parseResult.error.message });
    }
    const updates = parseResult.data;

    const db = getDb();
    const existing = await db
      .select({ id: runners.id })
      .from(runners)
      .where(and(eq(runners.id, id), eq(runners.tenantId, tenantId)))
      .limit(1);

    if (!existing[0]) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    const setValues: Partial<typeof runners.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (updates.email !== undefined) setValues.entraEmail = updates.email;
    if (updates.extension !== undefined) setValues.extensionNumber = updates.extension;
    if (updates.allowedDeptIds !== undefined) setValues.allowedDeptIds = updates.allowedDeptIds;
    if (updates.isActive !== undefined) setValues.isActive = updates.isActive;

    const updated = await db
      .update(runners)
      .set(setValues)
      .where(eq(runners.id, id))
      .returning();

    return reply.send({ runner: updated[0] });
  });

  // ── DELETE /admin/runners/:id ──────────────────────────────────────────────

  fastify.delete('/admin/runners/:id', async (request, reply) => {
    const { tenantId, entraEmail } = request.adminSession!;
    if (!tenantId) return reply.code(401).send({ error: 'UNAUTHORIZED' });

    try { await assertAdmin(entraEmail, tenantId); } catch (e: unknown) {
      const err = e as { statusCode?: number; code?: string };
      return reply.code(err.statusCode ?? 403).send({ error: err.code ?? 'FORBIDDEN' });
    }

    const { id } = request.params as { id: string };
    const db = getDb();

    const existing = await db
      .select({ id: runners.id })
      .from(runners)
      .where(and(eq(runners.id, id), eq(runners.tenantId, tenantId)))
      .limit(1);

    if (!existing[0]) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    await db
      .update(runners)
      .set({ isActive: false, updatedAt: sql`now()` })
      .where(eq(runners.id, id));

    return reply.code(204).send();
  });
}
