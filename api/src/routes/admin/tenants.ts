/**
 * src/routes/admin/tenants.ts
 *
 * GET  /admin/tenants      — list all tenants (super_admin only)
 * POST /admin/tenants      — create a new tenant (super_admin only)
 * GET  /admin/tenants/me   — get current tenant config (auto-creates on first login)
 * PUT  /admin/tenants/me   — update tenant (name, entraGroupId, entraTenantId)
 */

import type { FastifyInstance } from 'fastify';
import { eq, sql, ilike, count, inArray, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../../db/index.js';
import { tenants, users, pbxCredentials, runners, auditLog, deptCache, pbxExtensions, managerTenants } from '../../db/schema.js';
import { requireAuth, requireRole } from '../../middleware/requireAuth.js';
import { createSessionToken } from '../../middleware/session.js';
import type { UnifiedSession } from '../../middleware/session.js';
import { updateTenantSchema, createTenantSchema } from '../../utils/validate.js';

export async function adminTenantRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  // ── GET /admin/tenants ─────────────────────────────────────────────────────
  // Lists all tenants. Super_admin only.
  // Query: ?search=name&page=1&limit=25

  fastify.get('/admin/tenants', { preHandler: [requireRole('super_admin')] }, async (request, reply) => {
    const { search, page: pageStr, limit: limitStr } = request.query as {
      search?: string;
      page?: string;
      limit?: string;
    };

    const db = getDb();
    const page = Math.max(1, parseInt(pageStr ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(limitStr ?? '25', 10)));
    const offset = (page - 1) * limit;

    const whereClause = search
      ? ilike(tenants.name, `%${search}%`)
      : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(tenants)
        .where(whereClause)
        .orderBy(tenants.createdAt)
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(tenants)
        .where(whereClause),
    ]);
    const total = Number(countResult[0]?.total ?? 0);

    return reply.send({
      tenants: rows,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  });

  // ── POST /admin/tenants ────────────────────────────────────────────────────
  // Creates a new tenant. Super_admin only.
  // Body: { name, adminEmails: string[], entraTenantId?: string }
  // Returns: { tenant }

  fastify.post('/admin/tenants', { preHandler: [requireRole('super_admin')] }, async (request, reply) => {
    const session = request.session!;

    const parseResult = createTenantSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: parseResult.error.errors.map((e) => e.message).join('; '),
      });
    }

    const { name, adminEmails, entraTenantId } = parseResult.data;

    // Reject if super_admin tries to assign themselves — they already have global access.
    const myEmail = (session.entraEmail ?? session.email ?? '').toLowerCase();
    if (adminEmails.some((e) => e.toLowerCase() === myEmail)) {
      return reply.code(400).send({
        error: 'SELF_ASSIGN_NOT_ALLOWED',
        message: 'You cannot assign yourself as a company admin. Add a different email.',
      });
    }

    const db = getDb();

    // Use provided Entra tenant ID or a placeholder UUID (admin fills in later via Settings).
    const resolvedEntraTenantId = entraTenantId ?? randomUUID();

    try {
      const [tenant] = await db
        .insert(tenants)
        .values({
          entraTenantId: resolvedEntraTenantId,
          name,
          entraGroupId: '',
          adminEmails,
          isActive: true,
        })
        .returning();
      return reply.code(201).send({ tenant });
    } catch (err: unknown) {
      const pgCode = (err as { code?: string }).code;
      if (pgCode === '23505') {
        return reply.code(409).send({
          error: 'DUPLICATE_TENANT',
          message: 'A company with this Entra Tenant ID already exists.',
        });
      }
      throw err;
    }
  });

  // ── DELETE /admin/tenants/:id ─────────────────────────────────────────────
  // Hard-deletes a tenant and all its data. Super_admin only.
  // Users are unlinked (tenantId set to null), not deleted.
  // Cascade order: auditLog → runners → deptCache/pbxExtensions → pbxCredentials
  //                → managerTenants → users.tenantId null → tenant

  fastify.delete('/admin/tenants/:id', { preHandler: [requireRole('super_admin')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const rows = await db
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);

    if (!rows[0]) {
      return reply.code(404).send({ error: 'TENANT_NOT_FOUND' });
    }

    // Get pbx credential IDs for this tenant (needed for cascade)
    const pbxRows = await db
      .select({ id: pbxCredentials.id })
      .from(pbxCredentials)
      .where(eq(pbxCredentials.tenantId, id));
    const pbxIds = pbxRows.map(r => r.id);

    // Get runner IDs for this tenant (needed for audit log cascade)
    const runnerRows = await db
      .select({ id: runners.id })
      .from(runners)
      .where(eq(runners.tenantId, id));
    const runnerIds = runnerRows.map(r => r.id);

    // Cascade delete in FK-safe order
    if (runnerIds.length > 0) {
      await db.delete(auditLog).where(inArray(auditLog.runnerId, runnerIds));
    }
    await db.delete(runners).where(eq(runners.tenantId, id));

    if (pbxIds.length > 0) {
      await db.delete(deptCache).where(inArray(deptCache.pbxCredentialId, pbxIds));
      await db.delete(pbxExtensions).where(inArray(pbxExtensions.pbxCredentialId, pbxIds));
    }
    await db.delete(pbxCredentials).where(eq(pbxCredentials.tenantId, id));

    // Unlink users (keep their accounts, just remove tenant association)
    await db.update(users).set({ tenantId: null }).where(eq(users.tenantId, id));

    // managerTenants has ON DELETE CASCADE on tenantId — deleted automatically with tenant
    await db.delete(tenants).where(eq(tenants.id, id));

    return reply.code(200).send({ message: `${rows[0].name} deleted.` });
  });

  // ── GET /admin/tenants/:id/admins ─────────────────────────────────────────
  // Returns users who are admins/managers of this tenant. Super_admin only.

  fastify.get('/admin/tenants/:id/admins', { preHandler: [requireRole('super_admin')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const adminUsers = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        tenantId: users.tenantId,
      })
      .from(managerTenants)
      .innerJoin(users, eq(managerTenants.userId, users.id))
      .where(eq(managerTenants.tenantId, id));

    return reply.send({ admins: adminUsers });
  });

  // ── POST /admin/tenants/:id/admins/reassign ───────────────────────────────
  // Moves a user's admin access from this tenant to a different one.
  // Super_admin only.
  // Body: { userId, targetTenantId }

  fastify.post('/admin/tenants/:id/admins/reassign', { preHandler: [requireRole('super_admin')] }, async (request, reply) => {
    const { id: sourceTenantId } = request.params as { id: string };
    const session = request.session!;

    const body = request.body as { userId?: string; targetTenantId?: string };
    if (!body.userId || !body.targetTenantId) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'userId and targetTenantId are required.' });
    }
    const { userId, targetTenantId } = body;

    if (sourceTenantId === targetTenantId) {
      return reply.code(400).send({ error: 'SAME_TENANT', message: 'Source and target company are the same.' });
    }

    const db = getDb();

    // Verify both tenants exist
    const [sourceRows, targetRows] = await Promise.all([
      db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, sourceTenantId)).limit(1),
      db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, targetTenantId)).limit(1),
    ]);
    if (!sourceRows[0]) return reply.code(404).send({ error: 'SOURCE_TENANT_NOT_FOUND' });
    if (!targetRows[0]) return reply.code(404).send({ error: 'TARGET_TENANT_NOT_FOUND' });

    // Verify user exists and is linked to source tenant
    const userRows = await db
      .select({ id: users.id, email: users.email, tenantId: users.tenantId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!userRows[0]) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    const user = userRows[0];

    // Remove from source tenant's managerTenants
    await db
      .delete(managerTenants)
      .where(
        and(
          eq(managerTenants.userId, userId),
          eq(managerTenants.tenantId, sourceTenantId),
        ),
      );

    // Add to target tenant's managerTenants (ignore if already exists)
    await db
      .insert(managerTenants)
      .values({ userId, tenantId: targetTenantId, assignedBy: session.userId })
      .onConflictDoNothing();

    // Update user's primary tenantId if it was the source tenant
    if (user.tenantId === sourceTenantId) {
      await db.update(users).set({ tenantId: targetTenantId }).where(eq(users.id, userId));
    }

    return reply.send({ message: 'Admin reassigned successfully.' });
  });

  // ── GET /admin/tenants/me ──────────────────────────────────────────────────

  fastify.get('/admin/tenants/me', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const session = request.session!;
    const tenantId = (request.query as { tenantId?: string }).tenantId ?? session.tenantId;
    const db = getDb();

    let tenantRow: typeof tenants.$inferSelect | undefined;

    if (tenantId) {
      const rows = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      tenantRow = rows[0];
    } else if (session.tid) {
      const rows = await db
        .select()
        .from(tenants)
        .where(eq(tenants.entraTenantId, session.tid))
        .limit(1);
      tenantRow = rows[0];

      if (!tenantRow) {
        const created = await db
          .insert(tenants)
          .values({
            entraTenantId: session.tid,
            name: `Tenant ${session.tid}`,
            entraGroupId: '',
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
    if (session.role !== 'super_admin' && !tenantId) {
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
        ...(updates.entraTenantId !== undefined && { entraTenantId: updates.entraTenantId }),
        updatedAt: sql`now()`,
      })
      .where(eq(tenants.id, tenantId!))
      .returning();

    return reply.send({ tenant: updated[0] });
  });
}
