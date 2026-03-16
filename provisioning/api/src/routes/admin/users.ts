/**
 * src/routes/admin/users.ts
 *
 * User management endpoints for admin roles.
 * Simplified from Runner App — no manager_tenants or runner linking.
 *
 * GET    /admin/users          — paginated user list
 * PUT    /admin/users/:id/role — change user role
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, ilike, count } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { users, auditLog } from '../../db/schema.js';
import { requireAuth, requireRole } from '../../middleware/requireAuth.js';

export async function adminUserRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  // GET /admin/users
  fastify.get('/admin/users', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const session = request.session!;
    const query = request.query as {
      page?: string;
      limit?: string;
      role?: string;
      email?: string;
    };

    const db = getDb();
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '25', 10)));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (query.role) {
      conditions.push(eq(users.role, query.role));
    }
    if (query.email) {
      conditions.push(ilike(users.email, `%${query.email}%`));
    }
    // Tenant scoping for non-super_admin
    if (session.role !== 'super_admin' && session.tenantId) {
      conditions.push(eq(users.tenantId, session.tenantId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult, rows] = await Promise.all([
      db.select({ count: count() }).from(users).where(whereClause),
      db
        .select({
          id: users.id,
          email: users.email,
          role: users.role,
          tenantId: users.tenantId,
          emailVerified: users.emailVerified,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(whereClause)
        .orderBy(users.createdAt)
        .limit(limit)
        .offset(offset),
    ]);

    const total = countResult[0]?.count ?? 0;

    return reply.send({ users: rows, total, page, pages: Math.ceil(total / limit) });
  });

  // PUT /admin/users/:id/role
  fastify.put('/admin/users/:id/role', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const session = request.session!;
    const { id } = request.params as { id: string };

    if (id === session.userId) {
      return reply.code(400).send({ error: 'CANNOT_CHANGE_OWN_ROLE' });
    }

    const body = request.body as { role: string };
    const newRole = body.role;
    if (!['admin', 'runner'].includes(newRole)) {
      return reply.code(400).send({ error: 'INVALID_ROLE' });
    }

    // Only super_admin can assign admin role
    if (newRole === 'admin' && session.role !== 'super_admin') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Only super_admin can assign admin role' });
    }

    const db = getDb();

    const targetRows = await db
      .select({ id: users.id, role: users.role, tenantId: users.tenantId })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!targetRows[0]) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    // Tenant scope check
    if (session.role !== 'super_admin' && session.tenantId && targetRows[0].tenantId !== session.tenantId) {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }

    await db.update(users).set({ role: newRole }).where(eq(users.id, id));

    await db.insert(auditLog).values({
      userEmail: session.email,
      action: 'user.role_changed',
      targetType: 'user',
      targetId: id,
      details: JSON.stringify({ from: targetRows[0].role, to: newRole }),
    });

    return reply.send({ user: { id, role: newRole } });
  });
}
