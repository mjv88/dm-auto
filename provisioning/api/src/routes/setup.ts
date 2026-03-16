/**
 * src/routes/setup.ts
 *
 * Self-service onboarding wizard endpoints:
 *   GET  /setup/status      — check onboarding progress
 *   POST /setup/company     — create tenant (company)
 *   POST /setup/pbx         — connect PBX, fetch + cache extensions
 *   GET  /setup/extensions   — list cached PBX extensions
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, asc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import {
  tenants,
  users,
  pbxCredentials,
  pbxExtensions,
} from '../db/schema.js';
import { setupAuthenticate } from '../middleware/setupAuth.js';
import { createSessionToken } from '../middleware/session.js';
import { encrypt } from '../utils/encrypt.js';
import { validatePbxConnectivity } from '../utils/pbx.js';
import { XAPIClient } from '../xapi/client.js';
import {
  setupCompanySchema,
  createPbxSchema,
} from '../utils/validate.js';

// ── Helper: assert user is admin of their tenant ─────────────────────────────

async function assertTenantAdmin(
  email: string,
  tenantId: string | null,
): Promise<string> {
  if (!tenantId) {
    const e = new Error('No tenant') as Error & { statusCode: number; code: string };
    e.statusCode = 403;
    e.code = 'FORBIDDEN';
    throw e;
  }
  const db = getDb();
  const rows = await db
    .select({ adminEmails: tenants.adminEmails })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const row = rows[0];
  if (!row || !row.adminEmails.includes(email)) {
    const e = new Error('Forbidden') as Error & { statusCode: number; code: string };
    e.statusCode = 403;
    e.code = 'FORBIDDEN';
    throw e;
  }
  return tenantId;
}

// ── Route plugin ─────────────────────────────────────────────────────────────

export async function setupRoutes(fastify: FastifyInstance): Promise<void> {
  // All setup routes require setupAuthenticate
  fastify.addHook('preHandler', setupAuthenticate);

  // ── GET /setup/status ───────────────────────────────────────────────────────

  fastify.get('/setup/status', async (request, reply) => {
    const ctx = request.setupContext!;
    const db = getDb();

    const hasCompany = !!ctx.tenantId;
    let hasPbx = false;
    let extensionCount = 0;

    if (ctx.tenantId) {
      const pbxRows = await db
        .select({ id: pbxCredentials.id })
        .from(pbxCredentials)
        .where(and(eq(pbxCredentials.tenantId, ctx.tenantId), eq(pbxCredentials.isActive, true)))
        .limit(1);
      hasPbx = pbxRows.length > 0;

      if (pbxRows[0]) {
        const extRows = await db
          .select({ id: pbxExtensions.id })
          .from(pbxExtensions)
          .where(eq(pbxExtensions.pbxCredentialId, pbxRows[0].id));
        extensionCount = extRows.length;
      }
    }

    return reply.send({ hasCompany, hasPbx, extensionCount });
  });

  // ── POST /setup/company ─────────────────────────────────────────────────────

  fastify.post('/setup/company', async (request, reply) => {
    const ctx = request.setupContext!;
    const parsed = setupCompanySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Invalid input',
      });
    }

    const db = getDb();
    const { name } = parsed.data;

    // Create tenant
    const created = await db
      .insert(tenants)
      .values({
        name,
        createdBy: ctx.email,
        adminEmails: [ctx.email],
      })
      .returning();

    const tenant = created[0];

    // Set user's tenantId
    await db
      .update(users)
      .set({ tenantId: tenant.id })
      .where(eq(users.id, ctx.userId));

    // Issue new session token with tenantId
    const sessionToken = createSessionToken({
      type: 'session',
      userId: ctx.userId,
      email: ctx.email,
      role: 'runner',
      tenantId: tenant.id,
      emailVerified: true,
    });

    return reply.code(201).send({ tenant, sessionToken });
  });

  // ── POST /setup/pbx ────────────────────────────────────────────────────────

  fastify.post(
    '/setup/pbx',
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: 60_000, // 3 per minute
        },
      },
    },
    async (request, reply) => {
      const ctx = request.setupContext!;
      let tenantId: string;
      try {
        tenantId = await assertTenantAdmin(ctx.email, ctx.tenantId);
      } catch (e: unknown) {
        const err = e as { statusCode?: number; code?: string };
        return reply.code(err.statusCode ?? 403).send({ error: err.code ?? 'FORBIDDEN' });
      }

      const parsed = createPbxSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid input',
        });
      }

      const { fqdn, name, authMode, credentials } = parsed.data;

      // Validate connectivity
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

      // Create pbx_credentials row (encrypted)
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
          : {}),
      };

      const createdRows = await db.insert(pbxCredentials).values(values).returning();
      const pbx = createdRows[0];

      // Fetch extensions from PBX and cache them
      try {
        const client = await XAPIClient.create(fqdn);

        // Cache extensions (users) — include Id as pbxUserId for GenerateProvLink
        const allUsers = await client.getAllUsers();
        if (allUsers.length > 0) {
          await db.insert(pbxExtensions).values(
            allUsers.map((u) => ({
              pbxCredentialId: pbx.id,
              extensionNumber: u.number,
              email: u.email || null,
              displayName: u.displayName || null,
              pbxUserId: u.userId,  // 3CX Id field — needed for GenerateProvLink()
            })),
          );
        }
      } catch (cacheErr) {
        // Non-fatal — PBX was created, but caching failed
        fastify.log.error({ err: cacheErr }, 'Failed to cache PBX extensions during setup');
      }

      // Auto-promote user to admin on setup completion
      let sessionToken: string | undefined;
      const userRows = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1);
      const currentUser = userRows[0];

      if (currentUser && (currentUser.role === 'runner' || !currentUser.role)) {
        await db
          .update(users)
          .set({ role: 'admin' })
          .where(eq(users.id, ctx.userId));

        sessionToken = createSessionToken({
          type: 'session',
          userId: ctx.userId,
          email: ctx.email,
          role: 'admin',
          tenantId,
          emailVerified: true,
        });
      }

      return reply.code(201).send({ pbx, ...(sessionToken ? { sessionToken } : {}) });
    },
  );

  // ── GET /setup/extensions ──────────────────────────────────────────────────

  fastify.get('/setup/extensions', async (request, reply) => {
    const ctx = request.setupContext!;
    let tenantId: string;
    try {
      tenantId = await assertTenantAdmin(ctx.email, ctx.tenantId);
    } catch (e: unknown) {
      const err = e as { statusCode?: number; code?: string };
      return reply.code(err.statusCode ?? 403).send({ error: err.code ?? 'FORBIDDEN' });
    }

    const db = getDb();
    const { pbxId, search } = request.query as { pbxId?: string; search?: string };

    // Find PBX credential for this tenant
    let pbxCredId: string;
    if (pbxId) {
      const pbxRow = await db
        .select({ id: pbxCredentials.id })
        .from(pbxCredentials)
        .where(and(eq(pbxCredentials.id, pbxId), eq(pbxCredentials.tenantId, tenantId)))
        .limit(1);
      if (!pbxRow[0]) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'PBX not found' });
      }
      pbxCredId = pbxRow[0].id;
    } else {
      // Use first active PBX for tenant
      const pbxRow = await db
        .select({ id: pbxCredentials.id })
        .from(pbxCredentials)
        .where(and(eq(pbxCredentials.tenantId, tenantId), eq(pbxCredentials.isActive, true)))
        .limit(1);
      if (!pbxRow[0]) {
        return reply.send({ extensions: [] });
      }
      pbxCredId = pbxRow[0].id;
    }

    let extensions = await db
      .select()
      .from(pbxExtensions)
      .where(eq(pbxExtensions.pbxCredentialId, pbxCredId))
      .orderBy(asc(pbxExtensions.extensionNumber));

    // Client-side search filter (name, email, number)
    if (search) {
      const s = search.toLowerCase();
      extensions = extensions.filter(
        (e) =>
          e.extensionNumber.toLowerCase().includes(s) ||
          (e.displayName ?? '').toLowerCase().includes(s) ||
          (e.email ?? '').toLowerCase().includes(s),
      );
    }

    return reply.send({ extensions, pbxId: pbxCredId });
  });
}
