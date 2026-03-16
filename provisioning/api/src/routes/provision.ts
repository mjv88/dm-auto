import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { pbxExtensions, auditLog } from '../db/schema.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { decrypt } from '../utils/encrypt.js';

export async function provisionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/provision/android', { preHandler: requireAuth }, async (request, reply) => {
    const session = request.session!;
    const db = getDb();

    // Look up extension by email
    const rows = await db.select().from(pbxExtensions).where(eq(pbxExtensions.email, session.email)).limit(1);
    const ext = rows[0];

    if (!ext) {
      return reply.code(404).type('text/html').send(errorPage('Extension Not Found', 'Your extension hasn\'t been set up yet. Contact your admin.'));
    }

    if (!ext.provLinkExternal || ext.provisioningStatus === 'pending') {
      return reply.code(425).type('text/html').send(errorPage('Not Ready', 'Provisioning is not ready yet. Contact your admin.'));
    }

    if (ext.provisioningStatus === 'error') {
      return reply.code(500).type('text/html').send(errorPage('Error', `Provisioning failed: ${ext.provisioningError ?? 'Unknown error'}. Contact your admin.`));
    }

    // Decrypt and redirect
    const provLink = decrypt(ext.provLinkExternal);

    // Update status
    await db.update(pbxExtensions).set({
      provisioningStatus: 'delivered',
      lastDeliveredAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(pbxExtensions.id, ext.id));

    // Audit log
    await db.insert(auditLog).values({ userEmail: session.email, action: 'provision.delivered', targetType: 'extension', targetId: ext.id });

    // Redirect to 3cxprovlink:// URI scheme
    return reply.redirect(`3cxprovlink://${provLink}`);
  });
}

function errorPage(title: string, message: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb}div{text-align:center;max-width:400px;padding:2rem}.title{font-size:1.5rem;font-weight:bold;color:#111}.msg{color:#6b7280;margin-top:1rem}</style></head><body><div><p class="title">${title}</p><p class="msg">${message}</p></div></body></html>`;
}
