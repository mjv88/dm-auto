import type { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { pbxCredentials } from '../db/schema.js';

declare module 'fastify' {
  interface FastifyRequest {
    tenantScope?: { tenantId: string; pbxCredentialId: string };
  }
}

export async function requireApiKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Missing Bearer token' });
  }

  const token = header.slice(7);
  if (!token.startsWith('prov_')) {
    return reply.code(403).send({ error: 'FORBIDDEN', message: 'Invalid API key' });
  }

  const hash = createHash('sha256').update(token).digest('hex');
  const db = getDb();

  const rows = await db
    .select({ id: pbxCredentials.id, tenantId: pbxCredentials.tenantId })
    .from(pbxCredentials)
    .where(eq(pbxCredentials.provisionApiKeyHash, hash))
    .limit(1);

  if (!rows[0]) {
    return reply.code(403).send({ error: 'FORBIDDEN', message: 'Invalid API key' });
  }

  request.tenantScope = { tenantId: rows[0].tenantId, pbxCredentialId: rows[0].id };
}
