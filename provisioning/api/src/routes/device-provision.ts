import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { pbxExtensions, auditLog } from '../db/schema.js';
import { requireApiKey } from '../middleware/requireApiKey.js';
import { decrypt } from '../utils/encrypt.js';

export async function deviceProvisionRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /provision/device?email={email}&version={hash}
  fastify.get('/provision/device', { preHandler: requireApiKey }, async (request, reply) => {
    const scope = request.tenantScope!;
    const db = getDb();

    const query = request.query as { email?: string; version?: string };
    if (!query.email) {
      return reply.code(400).send({ error: 'BAD_REQUEST', message: 'email query parameter is required' });
    }

    const rows = await db
      .select()
      .from(pbxExtensions)
      .where(and(
        eq(pbxExtensions.email, query.email),
        eq(pbxExtensions.pbxCredentialId, scope.pbxCredentialId),
      ))
      .limit(1);

    const ext = rows[0];
    if (!ext) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Extension not found for this email' });
    }

    if (ext.provisioningStatus === 'pending' || ext.provisioningStatus === 'provisioning') {
      return reply.code(425).send({ error: 'TOO_EARLY', message: 'Provisioning is not ready yet' });
    }

    if (ext.provisioningStatus === 'error') {
      return reply.code(500).send({ error: 'PROVISION_ERROR', message: ext.provisioningError ?? 'Provisioning failed' });
    }

    if (!ext.provConfigXml) {
      return reply.code(425).send({ error: 'TOO_EARLY', message: 'Config not available yet' });
    }

    // 304 if version matches
    if (query.version && ext.configVersion && query.version === ext.configVersion) {
      return reply.code(304).send();
    }

    const xml = decrypt(ext.provConfigXml);

    // Update status
    await db.update(pbxExtensions).set({
      provisioningStatus: 'delivered',
      lastDeliveredAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(pbxExtensions.id, ext.id));

    // Audit log
    await db.insert(auditLog).values({
      userEmail: query.email,
      action: 'provision.device.delivered',
      targetType: 'extension',
      targetId: ext.id,
    });

    const filename = `3cxprov_${ext.extensionNumber}.3cxconfig`;
    return reply
      .type('application/3cxconfig')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(xml);
  });

  // POST /provision/device/ack
  fastify.post('/provision/device/ack', { preHandler: requireApiKey }, async (request, reply) => {
    const scope = request.tenantScope!;
    const db = getDb();

    const body = request.body as { email?: string; deviceId?: string; deviceName?: string };
    if (!body.email) {
      return reply.code(400).send({ error: 'BAD_REQUEST', message: 'email is required' });
    }

    const rows = await db
      .select()
      .from(pbxExtensions)
      .where(and(
        eq(pbxExtensions.email, body.email),
        eq(pbxExtensions.pbxCredentialId, scope.pbxCredentialId),
      ))
      .limit(1);

    const ext = rows[0];
    if (!ext) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Extension not found for this email' });
    }

    await db.update(pbxExtensions).set({
      deviceId: body.deviceId ?? null,
      deviceName: body.deviceName ?? null,
      lastAckedAt: new Date(),
      provisioningStatus: 'delivered',
      updatedAt: new Date(),
    }).where(eq(pbxExtensions.id, ext.id));

    // Audit log
    await db.insert(auditLog).values({
      userEmail: body.email,
      action: 'provision.device.ack',
      targetType: 'extension',
      targetId: ext.id,
      details: JSON.stringify({ deviceId: body.deviceId, deviceName: body.deviceName }),
    });

    return reply.send({ data: { status: 'delivered' } });
  });
}
