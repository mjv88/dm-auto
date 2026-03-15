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
import { users, managerTenants, tenants, runners } from '../../db/schema.js';
import { requireAuth, requireRole } from '../../middleware/requireAuth.js';
import { changeRoleSchema } from '../../utils/validate.js';

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
      conditions.push(ilike(users.email, `%${query.email}%`));
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
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(whereClause)
      .orderBy(users.createdAt)
      .limit(limit)
      .offset(offset);

    return reply.send({ users: rows, total, page, pages: Math.ceil(total / limit) });
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
}
