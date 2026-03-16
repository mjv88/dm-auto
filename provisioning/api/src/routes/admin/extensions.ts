import type { FastifyInstance } from 'fastify';
import { eq, and, sql, count } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { pbxExtensions, pbxCredentials, auditLog } from '../../db/schema.js';
import { requireAuth, requireRole } from '../../middleware/requireAuth.js';
import { provisionExtension } from '../../services/provisioning.js';

export async function extensionRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /admin/extensions — list all extensions with provisioning status
  fastify.get(
    '/admin/extensions',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (request, reply) => {
      const session = request.session!;
      const db = getDb();

      const query = request.query as { page?: string; limit?: string; status?: string; pbxId?: string };
      const page = Math.max(1, parseInt(query.page ?? '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '50', 10)));
      const offset = (page - 1) * limit;

      // Build conditions
      const conditions = [];
      if (session.tenantId) {
        // Get PBX IDs for this tenant
        const pbxRows = await db
          .select({ id: pbxCredentials.id })
          .from(pbxCredentials)
          .where(eq(pbxCredentials.tenantId, session.tenantId));
        const pbxIds = pbxRows.map((r) => r.id);
        if (pbxIds.length === 0) {
          return reply.send({ extensions: [], total: 0, page, pages: 0 });
        }
        conditions.push(sql`${pbxExtensions.pbxCredentialId} IN (${sql.join(pbxIds.map(id => sql`${id}`), sql`, `)})`);
      }
      if (query.status) {
        conditions.push(eq(pbxExtensions.provisioningStatus, query.status));
      }
      if (query.pbxId) {
        conditions.push(eq(pbxExtensions.pbxCredentialId, query.pbxId));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [extensions, totalResult] = await Promise.all([
        db
          .select()
          .from(pbxExtensions)
          .where(whereClause)
          .limit(limit)
          .offset(offset)
          .orderBy(pbxExtensions.extensionNumber),
        db
          .select({ count: count() })
          .from(pbxExtensions)
          .where(whereClause),
      ]);

      const total = totalResult[0]?.count ?? 0;

      return reply.send({
        extensions,
        total,
        page,
        pages: Math.ceil(total / limit),
      });
    },
  );

  // POST /admin/extensions/provision — bulk provision
  fastify.post(
    '/admin/extensions/provision',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (request, reply) => {
      const session = request.session!;
      const { extensionIds } = request.body as { extensionIds: string[] };

      if (!Array.isArray(extensionIds) || extensionIds.length === 0) {
        return reply.code(400).send({ error: 'extensionIds is required' });
      }

      const provisioned: string[] = [];
      const failed: string[] = [];
      const errors: Record<string, string> = {};

      for (let i = 0; i < extensionIds.length; i++) {
        const id = extensionIds[i];
        const result = await provisionExtension(id, session.email);
        if (result.success) {
          provisioned.push(id);
        } else {
          failed.push(id);
          errors[id] = result.error ?? 'Unknown error';
        }
        // 2s delay between each (except the last)
        if (i < extensionIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      return reply.send({ provisioned, failed, errors });
    },
  );

  // POST /admin/extensions/:id/reprovision — re-provision a single extension
  fastify.post(
    '/admin/extensions/:id/reprovision',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (request, reply) => {
      const session = request.session!;
      const { id } = request.params as { id: string };
      const db = getDb();

      // Reset to pending
      await db
        .update(pbxExtensions)
        .set({
          provLinkExternal: null,
          provLinkFetchedAt: null,
          provisioningStatus: 'pending',
          provisioningError: null,
          updatedAt: new Date(),
        })
        .where(eq(pbxExtensions.id, id));

      await db.insert(auditLog).values({
        userEmail: session.email,
        action: 'provision.reprovision',
        targetType: 'extension',
        targetId: id,
      });

      // Now provision
      const result = await provisionExtension(id, session.email);
      return reply.send(result);
    },
  );
}
