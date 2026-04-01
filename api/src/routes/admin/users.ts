/**
 * src/routes/admin/users.ts
 *
 * User management endpoints for admin and manager roles.
 *
 * GET    /admin/users          — paginated user list
 * GET    /admin/users/:id      — user detail with managed companies
 * PUT    /admin/users/:id/role — change user role
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, sql, ilike, inArray } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { users, managerTenants, tenants, runners, pbxCredentials } from '../../db/schema.js';
import { requireAuth, requireRole } from '../../middleware/requireAuth.js';
import { changeRoleSchema, reassignCompanySchema, pricingAccessSchema } from '../../utils/validate.js';
import { createSessionToken } from '../../middleware/session.js';
import { escapeLike } from '../../utils/sanitize.js';

export async function adminUserRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  // ── GET /admin/users ─────────────────────────────────────────────────────

  fastify.get('/admin/users', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const session = request.session!;
    const query = request.query as {
      page?: string;
      limit?: string;
      role?: string;
      email?: string;
      tenantId?: string;
    };

    const db = getDb();
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '25', 10)));
    const offset = (page - 1) * limit;

    const conditions = [];

    // Role filter
    if (query.role) {
      conditions.push(eq(users.role, query.role));
    }

    // Email search (partial match)
    if (query.email) {
      conditions.push(ilike(users.email, `%${escapeLike(query.email)}%`));
    }

    // Tenant filter
    const filterTenantId = query.tenantId ?? null;
    if (filterTenantId) {
      conditions.push(eq(users.tenantId, filterTenantId));
    }

    // Admin and manager can only see users in their managed tenants
    if (session.role === 'admin' || session.role === 'manager') {
      const managedRows = await db
        .select({ tenantId: managerTenants.tenantId })
        .from(managerTenants)
        .where(eq(managerTenants.userId, session.userId));
      const managedTenantIds = managedRows.map(r => r.tenantId);

      if (managedTenantIds.length === 0) {
        return reply.send({ users: [], total: 0, page, pages: 0 });
      }
      conditions.push(inArray(users.tenantId, managedTenantIds));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(whereClause);
    const total = countResult[0]?.count ?? 0;

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        tenantId: users.tenantId,
        tenantName: tenants.name,
        emailVerified: users.emailVerified,
        pricingAccess: users.pricingAccess,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .leftJoin(tenants, eq(users.tenantId, tenants.id))
      .where(whereClause)
      .orderBy(users.createdAt)
      .limit(limit)
      .offset(offset);

    // Fetch PBX names for each user (via runners → pbx_credentials)
    const userIds = rows.map(r => r.id);
    const pbxRows = userIds.length > 0
      ? await db
          .select({
            userId: runners.userId,
            pbxName: pbxCredentials.pbxName,
          })
          .from(runners)
          .innerJoin(pbxCredentials, eq(runners.pbxCredentialId, pbxCredentials.id))
          .where(inArray(runners.userId, userIds))
      : [];

    // Group pbx names by userId
    const pbxByUser = new Map<string, string[]>();
    for (const r of pbxRows) {
      if (!r.userId) continue;
      const existing = pbxByUser.get(r.userId) ?? [];
      if (!existing.includes(r.pbxName)) existing.push(r.pbxName);
      pbxByUser.set(r.userId, existing);
    }

    const enriched = rows.map(r => ({
      ...r,
      pbxNames: pbxByUser.get(r.id) ?? [],
    }));

    return reply.send({ users: enriched, total, page, pages: Math.ceil(total / limit) });
  });

  // ── GET /admin/users/:id ────────────────────────────────────────────────

  fastify.get('/admin/users/:id', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const session = request.session!;
    const { id } = request.params as { id: string };
    const db = getDb();

    const userRows = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        tenantId: users.tenantId,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    const user = userRows[0];
    if (!user) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    // Admin and manager can only view users in their managed tenants
    if (session.role === 'admin' || session.role === 'manager') {
      const managedRows = await db
        .select({ tenantId: managerTenants.tenantId })
        .from(managerTenants)
        .where(eq(managerTenants.userId, session.userId));
      const managedTenantIds = managedRows.map(r => r.tenantId);
      if (!user.tenantId || !managedTenantIds.includes(user.tenantId)) {
        return reply.code(403).send({ error: 'FORBIDDEN' });
      }
    }

    // Get managed companies for this user
    const managedCompanies = await db
      .select({
        tenantId: managerTenants.tenantId,
        tenantName: tenants.name,
        assignedAt: managerTenants.createdAt,
      })
      .from(managerTenants)
      .innerJoin(tenants, eq(managerTenants.tenantId, tenants.id))
      .where(eq(managerTenants.userId, id));

    // Get linked runners
    const linkedRunners = await db
      .select({
        id: runners.id,
        extensionNumber: runners.extensionNumber,
        entraEmail: runners.entraEmail,
        isActive: runners.isActive,
      })
      .from(runners)
      .where(eq(runners.userId, id));

    return reply.send({ user, managedCompanies, linkedRunners });
  });

  // ── PUT /admin/users/:id/role ──────────────────────────────────────────

  fastify.put('/admin/users/:id/role', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const session = request.session!;
    const { id } = request.params as { id: string };

    // Cannot change own role
    if (id === session.userId) {
      return reply.code(400).send({ error: 'CANNOT_CHANGE_OWN_ROLE' });
    }

    const parsed = changeRoleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Invalid input',
      });
    }
    const { role: newRole, tenantIds } = parsed.data;

    const db = getDb();

    // Look up target user
    const targetRows = await db
      .select({ id: users.id, role: users.role, tenantId: users.tenantId })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    const target = targetRows[0];
    if (!target) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    // Only super_admin can change an admin's or super_admin's role
    if ((target.role === 'admin' || target.role === 'super_admin') && session.role !== 'super_admin') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Cannot change an admin role' });
    }

    // Only super_admin can assign admin or super_admin roles
    if ((newRole === 'admin' || newRole === 'super_admin') && session.role !== 'super_admin') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Only super_admin can assign admin or super_admin roles' });
    }

    // Admin and manager can only promote within their managed tenants
    if (session.role === 'admin' || session.role === 'manager') {
      const managedRows = await db
        .select({ tenantId: managerTenants.tenantId })
        .from(managerTenants)
        .where(eq(managerTenants.userId, session.userId));
      const managedTenantIds = managedRows.map(r => r.tenantId);

      if (!target.tenantId || !managedTenantIds.includes(target.tenantId)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'User not in your managed companies' });
      }

      // Admin/manager can only assign tenants they manage
      if (tenantIds) {
        const unauthorized = tenantIds.filter(tid => !managedTenantIds.includes(tid));
        if (unauthorized.length > 0) {
          return reply.code(403).send({ error: 'FORBIDDEN', message: 'Cannot assign companies you do not manage' });
        }
      }
    }

    // Apply role change
    await db
      .update(users)
      .set({ role: newRole })
      .where(eq(users.id, id));

    // Handle manager_tenants
    if (newRole === 'runner') {
      // Demoting to runner: remove all manager_tenants entries
      await db
        .delete(managerTenants)
        .where(eq(managerTenants.userId, id));
    } else if ((newRole === 'admin' || newRole === 'manager') && tenantIds && tenantIds.length > 0) {
      // Promoting to admin/manager: add tenant assignments
      // First remove existing entries (clean slate)
      await db
        .delete(managerTenants)
        .where(eq(managerTenants.userId, id));

      // Insert new assignments
      await db
        .insert(managerTenants)
        .values(
          tenantIds.map(tid => ({
            userId: id,
            tenantId: tid,
            assignedBy: session.userId,
          })),
        )
        .onConflictDoNothing();
    }

    // Check if user has no manager_tenants remaining — auto-demote to runner
    if (newRole === 'admin' || newRole === 'manager') {
      const remaining = await db
        .select({ id: managerTenants.id })
        .from(managerTenants)
        .where(eq(managerTenants.userId, id))
        .limit(1);
      if (remaining.length === 0) {
        await db
          .update(users)
          .set({ role: 'runner' })
          .where(eq(users.id, id));
        return reply.send({ user: { id, role: 'runner' } });
      }
    }

    return reply.send({ user: { id, role: newRole } });
  });

  // ── POST /admin/users/:id/impersonate ──────────────────────────────────

  fastify.post('/admin/users/:id/impersonate', { preHandler: [requireRole('super_admin')] }, async (request, reply) => {
    const session = request.session!;
    const { id } = request.params as { id: string };
    const db = getDb();

    const targetRows = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        tenantId: users.tenantId,
        emailVerified: users.emailVerified,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    const target = targetRows[0];
    if (!target) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    // Look up target's runner record (if they have one) to populate session context
    const runnerRows = await db
      .select({
        id: runners.id,
        extensionNumber: runners.extensionNumber,
        entraEmail: runners.entraEmail,
        pbxCredentialId: runners.pbxCredentialId,
      })
      .from(runners)
      .where(and(
        eq(runners.entraEmail, target.email),
        eq(runners.isActive, true),
      ))
      .limit(1);

    const runner = runnerRows[0] ?? null;

    // If runner exists, resolve PBX FQDN
    let pbxFqdn: string | null = null;
    if (runner) {
      const pbxRows = await db
        .select({ pbxFqdn: pbxCredentials.pbxFqdn })
        .from(pbxCredentials)
        .where(eq(pbxCredentials.id, runner.pbxCredentialId))
        .limit(1);
      pbxFqdn = pbxRows[0]?.pbxFqdn ?? null;
    }

    // Issue a session token as the target user, tagging with impersonator's userId
    const sessionToken = createSessionToken({
      type: 'session',
      userId: target.id,
      email: target.email,
      role: target.role as 'super_admin' | 'admin' | 'manager' | 'runner',
      tenantId: target.tenantId,
      runnerId: runner?.id ?? null,
      emailVerified: target.emailVerified,
      pbxFqdn,
      extensionNumber: runner?.extensionNumber ?? null,
      entraEmail: runner?.entraEmail ?? target.email,
      tid: null,
      oid: null,
      impersonatedBy: session.userId,
    });

    return reply.send({
      sessionToken,
      originalToken: request.headers.authorization?.slice(7) ?? null,
      user: { id: target.id, email: target.email, role: target.role },
    });
  });

  // ── DELETE /admin/users/:id ───────────────────────────────────────────

  fastify.delete('/admin/users/:id', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const session = request.session!;
    const { id } = request.params as { id: string };
    const db = getDb();

    // Cannot delete yourself
    if (id === session.userId) {
      return reply.code(400).send({ error: 'CANNOT_DELETE_SELF' });
    }

    const targetRows = await db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    const target = targetRows[0];
    if (!target) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    // Only super_admin can delete admin or super_admin
    if ((target.role === 'admin' || target.role === 'super_admin') && session.role !== 'super_admin') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Only super_admin can delete admin users' });
    }

    // Delete manager_tenants, runners, then user
    await db.delete(managerTenants).where(eq(managerTenants.userId, id));
    await db.delete(runners).where(eq(runners.userId, id));
    await db.delete(users).where(eq(users.id, id));

    return reply.code(204).send();
  });

  // ── PUT /admin/users/:id/company ──────────────────────────────────────────
  // Reassigns a user to a different company. Admin+ can do this, scoped to
  // companies they manage. Super_admin is unrestricted.

  fastify.put('/admin/users/:id/company', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const session = request.session!;
    const { id } = request.params as { id: string };

    const parsed = reassignCompanySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Invalid input',
      });
    }
    const targetTenantId = parsed.data.tenantId;

    if (id === session.userId) {
      return reply.code(400).send({ error: 'CANNOT_REASSIGN_SELF' });
    }

    const db = getDb();

    // Verify target tenant exists
    const tenantRows = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, targetTenantId))
      .limit(1);
    if (!tenantRows[0]) {
      return reply.code(404).send({ error: 'TENANT_NOT_FOUND' });
    }

    // Fetch target user
    const userRows = await db
      .select({ id: users.id, tenantId: users.tenantId, role: users.role })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    const target = userRows[0];
    if (!target) return reply.code(404).send({ error: 'NOT_FOUND' });

    // Admin (non-super_admin): must manage both source and target company
    if (session.role !== 'super_admin') {
      const managedRows = await db
        .select({ tenantId: managerTenants.tenantId })
        .from(managerTenants)
        .where(eq(managerTenants.userId, session.userId));
      const managedIds = managedRows.map(r => r.tenantId);

      if (target.tenantId && !managedIds.includes(target.tenantId)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'You do not manage the user\'s current company.' });
      }
      if (!managedIds.includes(targetTenantId)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'You do not manage the target company.' });
      }
    }

    const sourceTenantId = target.tenantId;

    // Update primary tenant
    await db.update(users).set({ tenantId: targetTenantId }).where(eq(users.id, id));

    // Move managerTenants: remove from source, add to target
    if (sourceTenantId) {
      await db
        .delete(managerTenants)
        .where(and(eq(managerTenants.userId, id), eq(managerTenants.tenantId, sourceTenantId)));
    }
    await db
      .insert(managerTenants)
      .values({ userId: id, tenantId: targetTenantId, assignedBy: session.userId })
      .onConflictDoNothing();

    return reply.send({ message: 'User reassigned.' });
  });

  // ── PUT /admin/users/:id/pricing-access ───────────────────────────────────
  // Toggle pricing dashboard access for a user. Super_admin only.

  fastify.put('/admin/users/:id/pricing-access', { preHandler: [requireRole('super_admin')] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const parsed = pricingAccessSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Invalid input',
      });
    }
    const { pricingAccess } = parsed.data;

    const db = getDb();

    const targetRows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!targetRows[0]) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    await db
      .update(users)
      .set({ pricingAccess })
      .where(eq(users.id, id));

    return reply.send({ user: { id, pricingAccess } });
  });
}
