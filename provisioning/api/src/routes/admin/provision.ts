import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { pbxCredentials, pbxExtensions, auditLog } from '../../db/schema.js';
import { requireAuth, requireRole } from '../../middleware/requireAuth.js';

export async function adminProvisionRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /admin/provision/keys — generate API key for a PBX
  fastify.post(
    '/admin/provision/keys',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (request, reply) => {
      const session = request.session!;
      const db = getDb();

      const body = request.body as { pbxCredentialId?: string };
      if (!body.pbxCredentialId) {
        return reply.code(400).send({ error: 'BAD_REQUEST', message: 'pbxCredentialId is required' });
      }

      // Verify PBX exists
      const rows = await db
        .select({ id: pbxCredentials.id })
        .from(pbxCredentials)
        .where(eq(pbxCredentials.id, body.pbxCredentialId))
        .limit(1);

      if (!rows[0]) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'PBX credential not found' });
      }

      // Generate key: prov_ + 32 random bytes as base64url
      const rawKey = randomBytes(32).toString('base64url');
      const apiKey = `prov_${rawKey}`;
      const hash = createHash('sha256').update(apiKey).digest('hex');

      await db.update(pbxCredentials).set({
        provisionApiKeyHash: hash,
        updatedAt: new Date(),
      }).where(eq(pbxCredentials.id, body.pbxCredentialId));

      // Audit log
      await db.insert(auditLog).values({
        userEmail: session.email,
        action: 'provision.key.generated',
        targetType: 'pbx_credential',
        targetId: body.pbxCredentialId,
      });

      return reply.send({ data: { apiKey } });
    },
  );

  // DELETE /admin/provision/keys — revoke API key
  fastify.delete(
    '/admin/provision/keys',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (request, reply) => {
      const session = request.session!;
      const db = getDb();

      const body = request.body as { pbxCredentialId?: string };
      if (!body.pbxCredentialId) {
        return reply.code(400).send({ error: 'BAD_REQUEST', message: 'pbxCredentialId is required' });
      }

      await db.update(pbxCredentials).set({
        provisionApiKeyHash: null,
        updatedAt: new Date(),
      }).where(eq(pbxCredentials.id, body.pbxCredentialId));

      // Audit log
      await db.insert(auditLog).values({
        userEmail: session.email,
        action: 'provision.key.revoked',
        targetType: 'pbx_credential',
        targetId: body.pbxCredentialId,
      });

      return reply.send({ data: { revoked: true } });
    },
  );

  // GET /admin/provision/status?pbxCredentialId={id}
  fastify.get(
    '/admin/provision/status',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (request, reply) => {
      const db = getDb();

      const query = request.query as { pbxCredentialId?: string };
      if (!query.pbxCredentialId) {
        return reply.code(400).send({ error: 'BAD_REQUEST', message: 'pbxCredentialId query parameter is required' });
      }

      const extensions = await db
        .select({
          email: pbxExtensions.email,
          extensionNumber: pbxExtensions.extensionNumber,
          displayName: pbxExtensions.displayName,
          provisioningStatus: pbxExtensions.provisioningStatus,
          deviceId: pbxExtensions.deviceId,
          deviceName: pbxExtensions.deviceName,
          lastDeliveredAt: pbxExtensions.lastDeliveredAt,
          lastAckedAt: pbxExtensions.lastAckedAt,
        })
        .from(pbxExtensions)
        .where(eq(pbxExtensions.pbxCredentialId, query.pbxCredentialId))
        .orderBy(pbxExtensions.extensionNumber);

      return reply.send({ data: extensions });
    },
  );
}
