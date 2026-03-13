/**
 * src/routes/admin/pbx.ts
 *
 * Admin routes for managing PBX credentials (per tenant).
 * All routes require: valid admin session + admin_emails membership.
 *
 * GET    /admin/pbx        — list PBX credentials for tenant
 * POST   /admin/pbx        — add PBX (validates connectivity, encrypts credentials)
 * PUT    /admin/pbx/:id    — update PBX credentials
 * DELETE /admin/pbx/:id    — soft-delete (set is_active = false)
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { tenants, pbxCredentials } from '../../db/schema.js';
import { adminAuthenticate } from '../../middleware/authenticate.js';
import { encrypt } from '../../utils/encrypt.js';
import { XAPIClient } from '../../xapi/client.js';
import { createPbxSchema, updatePbxSchema } from '../../utils/validate.js';

// ── Helper ────────────────────────────────────────────────────────────────────

async function assertAdmin(
  adminEmail: string,
  tenantId: string,
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ adminEmails: tenants.adminEmails })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const row = rows[0];
  if (!row || !row.adminEmails.includes(adminEmail)) {
    const e = new Error('Forbidden') as Error & { statusCode: number; code: string };
    e.statusCode = 403;
    e.code = 'FORBIDDEN';
    throw e;
  }
}

/**
 * Validates connectivity to a PBX by attempting to list its Groups.
 * Throws if the PBX is unreachable or the credentials are invalid.
 */
async function validatePbxConnectivity(
  fqdn: string,
  authMode: 'xapi' | 'user_credentials',
  credentials: { clientId?: string; secret?: string; username?: string; password?: string },
): Promise<void> {
  if (authMode === 'xapi') {
    // Temporarily fetch a token directly to test credentials
    const tokenResp = await fetch(`https://${fqdn}/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: credentials.clientId!,
        client_secret: credentials.secret!,
      }),
    });
    if (!tokenResp.ok) {
      throw Object.assign(new Error(`PBX auth failed: HTTP ${tokenResp.status}`), {
        code: 'XAPI_AUTH_FAILED',
        statusCode: 422,
      });
    }
    const { access_token } = (await tokenResp.json()) as { access_token: string };

    // Quick Groups fetch to verify xAPI connectivity
    const groupsResp = await fetch(`https://${fqdn}/xapi/v1/Groups?$top=1`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!groupsResp.ok) {
      throw Object.assign(
        new Error(`PBX connectivity check failed: HTTP ${groupsResp.status}`),
        { code: 'PBX_UNAVAILABLE', statusCode: 422 },
      );
    }
  } else {
    // user_credentials — attempt basic auth login
    const loginResp = await fetch(`https://${fqdn}/webclient/api/Login/GetAccessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Username: credentials.username,
        Password: credentials.password,
      }),
    });
    if (!loginResp.ok) {
      throw Object.assign(new Error(`PBX user auth failed: HTTP ${loginResp.status}`), {
        code: 'XAPI_AUTH_FAILED',
        statusCode: 422,
      });
    }
  }
}

// ── Route plugin ──────────────────────────────────────────────────────────────

export async function adminPbxRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', adminAuthenticate);

  // ── GET /admin/pbx ─────────────────────────────────────────────────────────

  fastify.get('/admin/pbx', async (request, reply) => {
    const { tenantId, entraEmail } = request.adminSession!;
    if (!tenantId) return reply.code(401).send({ error: 'UNAUTHORIZED' });

    try { await assertAdmin(entraEmail, tenantId); } catch (e: unknown) {
      const err = e as { statusCode?: number; code?: string };
      return reply.code(err.statusCode ?? 403).send({ error: err.code ?? 'FORBIDDEN' });
    }

    const db = getDb();
    const rows = await db
      .select({
        id: pbxCredentials.id,
        pbxFqdn: pbxCredentials.pbxFqdn,
        pbxName: pbxCredentials.pbxName,
        authMode: pbxCredentials.authMode,
        isActive: pbxCredentials.isActive,
        createdAt: pbxCredentials.createdAt,
        updatedAt: pbxCredentials.updatedAt,
      })
      .from(pbxCredentials)
      .where(eq(pbxCredentials.tenantId, tenantId));

    return reply.send({ pbxList: rows });
  });

  // ── POST /admin/pbx ────────────────────────────────────────────────────────

  fastify.post('/admin/pbx', async (request, reply) => {
    const { tenantId, entraEmail } = request.adminSession!;
    if (!tenantId) return reply.code(401).send({ error: 'UNAUTHORIZED' });

    try { await assertAdmin(entraEmail, tenantId); } catch (e: unknown) {
      const err = e as { statusCode?: number; code?: string };
      return reply.code(err.statusCode ?? 403).send({ error: err.code ?? 'FORBIDDEN' });
    }

    const parseResult = createPbxSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: parseResult.error.message });
    }
    const { fqdn, name, authMode, credentials } = parseResult.data;

    // Validate connectivity before saving
    try {
      const credFields =
        credentials.mode === 'xapi'
          ? { clientId: credentials.clientId, secret: credentials.secret }
          : { username: credentials.username, password: credentials.password };
      await validatePbxConnectivity(fqdn, authMode, credFields);
    } catch (e: unknown) {
      const err = e as { statusCode?: number; code?: string; message?: string };
      return reply.code(err.statusCode ?? 422).send({
        error: err.code ?? 'PBX_UNAVAILABLE',
        message: err.message,
      });
    }

    // Encrypt credentials before storing
    const db = getDb();
    const values: typeof pbxCredentials.$inferInsert = {
      tenantId,
      pbxFqdn: fqdn,
      pbxName: name,
      authMode,
      ...(credentials.mode === 'xapi'
        ? {
            xapiClientId: encrypt(credentials.clientId),
            xapiSecret: encrypt(credentials.secret),
          }
        : {
            pbxUsername: encrypt(credentials.username),
            pbxPassword: encrypt(credentials.password),
          }),
    };

    const created = await db.insert(pbxCredentials).values(values).returning();
    return reply.code(201).send({ pbx: created[0] });
  });

  // ── PUT /admin/pbx/:id ─────────────────────────────────────────────────────

  fastify.put('/admin/pbx/:id', async (request, reply) => {
    const { tenantId, entraEmail } = request.adminSession!;
    if (!tenantId) return reply.code(401).send({ error: 'UNAUTHORIZED' });

    try { await assertAdmin(entraEmail, tenantId); } catch (e: unknown) {
      const err = e as { statusCode?: number; code?: string };
      return reply.code(err.statusCode ?? 403).send({ error: err.code ?? 'FORBIDDEN' });
    }

    const { id } = request.params as { id: string };
    const parseResult = updatePbxSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: parseResult.error.message });
    }
    const { name, credentials, isActive } = parseResult.data;

    const db = getDb();
    // Ensure the PBX belongs to this tenant
    const existing = await db
      .select({ id: pbxCredentials.id, pbxFqdn: pbxCredentials.pbxFqdn, authMode: pbxCredentials.authMode })
      .from(pbxCredentials)
      .where(and(eq(pbxCredentials.id, id), eq(pbxCredentials.tenantId, tenantId)))
      .limit(1);

    if (!existing[0]) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    const updates: Partial<typeof pbxCredentials.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updates.pbxName = name;
    if (isActive !== undefined) updates.isActive = isActive;
    if (credentials) {
      if (credentials.mode === 'xapi') {
        updates.xapiClientId = encrypt(credentials.clientId);
        updates.xapiSecret = encrypt(credentials.secret);
      } else {
        updates.pbxUsername = encrypt(credentials.username);
        updates.pbxPassword = encrypt(credentials.password);
      }
    }

    const updated = await db
      .update(pbxCredentials)
      .set(updates)
      .where(eq(pbxCredentials.id, id))
      .returning();

    return reply.send({ pbx: updated[0] });
  });

  // ── DELETE /admin/pbx/:id ──────────────────────────────────────────────────

  fastify.delete('/admin/pbx/:id', async (request, reply) => {
    const { tenantId, entraEmail } = request.adminSession!;
    if (!tenantId) return reply.code(401).send({ error: 'UNAUTHORIZED' });

    try { await assertAdmin(entraEmail, tenantId); } catch (e: unknown) {
      const err = e as { statusCode?: number; code?: string };
      return reply.code(err.statusCode ?? 403).send({ error: err.code ?? 'FORBIDDEN' });
    }

    const { id } = request.params as { id: string };
    const db = getDb();

    const existing = await db
      .select({ id: pbxCredentials.id })
      .from(pbxCredentials)
      .where(and(eq(pbxCredentials.id, id), eq(pbxCredentials.tenantId, tenantId)))
      .limit(1);

    if (!existing[0]) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    await db
      .update(pbxCredentials)
      .set({ isActive: false, updatedAt: sql`now()` })
      .where(eq(pbxCredentials.id, id));

    return reply.code(204).send();
  });
}
