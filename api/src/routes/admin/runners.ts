/**
 * src/routes/admin/runners.ts
 *
 * Admin routes for managing runner registrations (per tenant).
 * All routes require: valid session + manager or admin role.
 *
 * GET    /admin/runners        — list runners (filterable by pbx, active, email)
 * POST   /admin/runners        — add runner (validates extension on PBX)
 * PUT    /admin/runners/:id    — update runner
 * DELETE /admin/runners/:id    — soft-delete (set is_active = false)
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { runners, pbxCredentials, deptCache, users } from '../../db/schema.js';
import { requireAuth, requireRole } from '../../middleware/requireAuth.js';
import { XAPIClient } from '../../xapi/client.js';
import { createRunnerSchema, updateRunnerSchema } from '../../utils/validate.js';

// ── Route plugin ──────────────────────────────────────────────────────────────

export async function adminRunnerRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  // ── GET /admin/runners ─────────────────────────────────────────────────────

  fastify.get('/admin/runners', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const session = request.session!;
    const query = request.query as {
      tenantId?: string;
      pbxId?: string;
      active?: string;
      email?: string;
      page?: string;
      limit?: string;
    };
    const tenantId = query.tenantId ?? session.tenantId;
    if (session.role !== 'super_admin' && !tenantId) {
      return reply.code(400).send({ error: 'MISSING_TENANT' });
    }

    const db = getDb();
    const conditions = [];
    if (tenantId) conditions.push(eq(runners.tenantId, tenantId));

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
      .where(conditions.length > 0 ? and(...conditions) : undefined);
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
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(limit)
      .offset(offset);

    return reply.send({ runners: rows, total, page, pages: Math.ceil(total / limit) });
  });

  // ── POST /admin/runners ────────────────────────────────────────────────────

  fastify.post('/admin/runners', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const session = request.session!;
    const tenantId = (request.query as { tenantId?: string }).tenantId ?? session.tenantId;
    if (session.role !== 'super_admin' && !tenantId) {
      return reply.code(400).send({ error: 'MISSING_TENANT' });
    }
    if (!tenantId) {
      return reply.code(400).send({ error: 'MISSING_TENANT', message: 'tenantId required' });
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

    // Auto-link: find user account matching this email
    const normalizedEmail = email.toLowerCase().trim();
    let userId: string | null = null;
    const userRows = await db
      .select({ id: users.id, tenantId: users.tenantId })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (userRows[0]) {
      userId = userRows[0].id;
      // Also set user's tenantId if not already set
      if (!userRows[0].tenantId) {
        await db.update(users).set({ tenantId }).where(eq(users.id, userId));
      }
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
        createdBy: session.email,
        userId,
      })
      .returning();

    return reply.code(201).send({ runner: created[0] });
  });

  // ── PUT /admin/runners/:id ─────────────────────────────────────────────────

  fastify.put('/admin/runners/:id', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const session = request.session!;
    const tenantId = (request.query as { tenantId?: string }).tenantId ?? session.tenantId;
    if (session.role !== 'super_admin' && !tenantId) {
      return reply.code(400).send({ error: 'MISSING_TENANT' });
    }

    const { id } = request.params as { id: string };
    const parseResult = updateRunnerSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: parseResult.error.message });
    }
    const updates = parseResult.data;

    const db = getDb();
    const conditions = [eq(runners.id, id)];
    if (tenantId) conditions.push(eq(runners.tenantId, tenantId));

    const existing = await db
      .select({ id: runners.id })
      .from(runners)
      .where(and(...conditions))
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

  fastify.delete('/admin/runners/:id', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const session = request.session!;
    const tenantId = (request.query as { tenantId?: string }).tenantId ?? session.tenantId;
    if (session.role !== 'super_admin' && !tenantId) {
      return reply.code(400).send({ error: 'MISSING_TENANT' });
    }

    const { id } = request.params as { id: string };
    const db = getDb();

    const conditions = [eq(runners.id, id)];
    if (tenantId) conditions.push(eq(runners.tenantId, tenantId));

    const existing = await db
      .select({ id: runners.id })
      .from(runners)
      .where(and(...conditions))
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

  // ── GET /admin/departments ──────────────────────────────────────────────────

  fastify.get('/admin/departments', {
    preHandler: [requireRole('manager')],
  }, async (request, reply) => {
    const session = request.session!;
    const tenantId = (request.query as { tenantId?: string }).tenantId ?? session.tenantId;

    const db = getDb();

    // Find PBXs for this tenant (or all if admin with no filter)
    let pbxIds: string[];
    if (session.role === 'super_admin' && !tenantId) {
      const rows = await db.select({ id: pbxCredentials.id }).from(pbxCredentials).where(eq(pbxCredentials.isActive, true));
      pbxIds = rows.map(r => r.id);
    } else if (tenantId) {
      const rows = await db.select({ id: pbxCredentials.id }).from(pbxCredentials).where(and(eq(pbxCredentials.tenantId, tenantId), eq(pbxCredentials.isActive, true)));
      pbxIds = rows.map(r => r.id);
    } else {
      return reply.send([]);
    }

    if (pbxIds.length === 0) return reply.send([]);

    // Get unique departments from dept_cache
    const allDepts = [];
    for (const pbxId of pbxIds) {
      const rows = await db
        .select({ id: deptCache.deptId, name: deptCache.deptName })
        .from(deptCache)
        .where(eq(deptCache.pbxCredentialId, pbxId));
      allDepts.push(...rows);
    }

    // Deduplicate by name
    const seen = new Set<string>();
    const unique = allDepts.filter(d => {
      if (seen.has(d.name)) return false;
      seen.add(d.name);
      return true;
    });

    return reply.send(unique);
  });
}
