/**
 * src/routes/setup.ts
 *
 * Self-service onboarding wizard endpoints:
 *   GET  /setup/status      — check onboarding progress
 *   POST /setup/company     — create tenant (company)
 *   POST /setup/pbx         — connect PBX, cache groups + extensions
 *   GET  /setup/extensions   — list cached PBX extensions
 *   POST /setup/runners     — bulk-create runners from selected extensions
 *   POST /setup/invite      — send invite emails or generate invite link
 */

import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq, and, asc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import {
  tenants,
  users,
  pbxCredentials,
  runners,
  deptCache,
  pbxExtensions,
  managerTenants,
} from '../db/schema.js';
import { setupAuthenticate } from '../middleware/setupAuth.js';
import { createSessionToken } from '../middleware/session.js';
import { encrypt } from '../utils/encrypt.js';
import { validatePbxConnectivity } from '../utils/pbx.js';
import { XAPIClient } from '../xapi/client.js';
import {
  setupCompanySchema,
  setupRunnersSchema,
  setupInviteSchema,
  createPbxSchema,
} from '../utils/validate.js';
import { sendInviteEmail } from '../utils/email.js';

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
    let hasRunners = false;
    let runnerCount = 0;

    if (ctx.tenantId) {
      const pbxRows = await db
        .select({ id: pbxCredentials.id })
        .from(pbxCredentials)
        .where(and(eq(pbxCredentials.tenantId, ctx.tenantId), eq(pbxCredentials.isActive, true)))
        .limit(1);
      hasPbx = pbxRows.length > 0;

      const runnerRows = await db
        .select({ id: runners.id })
        .from(runners)
        .where(and(eq(runners.tenantId, ctx.tenantId), eq(runners.isActive, true)));
      runnerCount = runnerRows.length;
      hasRunners = runnerCount > 0;
    }

    return reply.send({ hasCompany, hasPbx, hasRunners, runnerCount });
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
        entraTenantId: 'local-' + crypto.randomUUID(),
        name,
        entraGroupId: '',
        adminEmails: [ctx.email],
      })
      .returning();

    const tenant = created[0];

    // Only set user's tenantId if they don't have one yet (not super_admin creating additional companies)
    const userRow = await db.select({ tenantId: users.tenantId, role: users.role }).from(users).where(eq(users.id, ctx.userId)).limit(1);
    const isSuperAdmin = userRow[0]?.role === 'super_admin';
    if (!isSuperAdmin || !userRow[0]?.tenantId) {
      await db
        .update(users)
        .set({ tenantId: tenant.id })
        .where(eq(users.id, ctx.userId));
    }

    // Also add to manager_tenants so super_admin can manage this tenant
    if (isSuperAdmin && userRow[0]?.tenantId) {
      await db.insert(managerTenants).values({ userId: ctx.userId, tenantId: tenant.id, assignedBy: ctx.userId }).onConflictDoNothing();
    }

    // Issue session token scoped to the NEW tenant (for subsequent setup steps)
    const sessionToken = createSessionToken({
      type: 'session',
      userId: ctx.userId,
      email: ctx.email,
      role: isSuperAdmin ? 'super_admin' : 'runner',
      tenantId: tenant.id,
      runnerId: null,
      emailVerified: true,
      pbxFqdn: null,
      extensionNumber: null,
      entraEmail: null,
      tid: null,
      oid: null,
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
          : {
              pbxUsername: encrypt(credentials.username),
              pbxPassword: encrypt(credentials.password),
            }),
      };

      const createdRows = await db.insert(pbxCredentials).values(values).returning();
      const pbx = createdRows[0];

      // Fetch groups and extensions from PBX and cache them
      try {
        const client = await XAPIClient.create(fqdn);

        // Cache groups (departments)
        const groups = await client.getGroups();
        if (groups.length > 0) {
          await db.insert(deptCache).values(
            groups.map((g) => ({
              pbxCredentialId: pbx.id,
              deptId: String(g.id),
              deptName: g.name,
            })),
          );
        }

        // Cache extensions (users)
        const allUsers = await client.getAllUsers();
        if (allUsers.length > 0) {
          await db.insert(pbxExtensions).values(
            allUsers.map((u) => ({
              pbxCredentialId: pbx.id,
              extensionNumber: u.number,
              email: u.email || null,
              displayName: u.displayName || null,
              currentGroupId: u.currentGroupId ? String(u.currentGroupId) : null,
              currentGroupName: u.currentGroupName || null,
            })),
          );
        }
      } catch (cacheErr) {
        // Non-fatal — PBX was created, but caching failed
        fastify.log.error({ err: cacheErr }, 'Failed to cache PBX groups/extensions during setup');
      }

      return reply.code(201).send({ pbx });
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
    const { pbxId, department, search } = request.query as { pbxId?: string; department?: string; search?: string };

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

    // Build conditions
    const conditions = [eq(pbxExtensions.pbxCredentialId, pbxCredId)];
    if (department) {
      conditions.push(eq(pbxExtensions.currentGroupName, department));
    }

    let extensions = await db
      .select()
      .from(pbxExtensions)
      .where(and(...conditions))
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

    // Get unique department names for the filter dropdown
    const allExts = await db
      .select({ currentGroupName: pbxExtensions.currentGroupName })
      .from(pbxExtensions)
      .where(eq(pbxExtensions.pbxCredentialId, pbxCredId));
    const departments = [...new Set(allExts.map(e => e.currentGroupName).filter(Boolean))].sort();

    return reply.send({ extensions, departments, pbxId: pbxCredId });
  });

  // ── POST /setup/runners ────────────────────────────────────────────────────

  fastify.post('/setup/runners', async (request, reply) => {
    const ctx = request.setupContext!;
    let tenantId: string;
    try {
      tenantId = await assertTenantAdmin(ctx.email, ctx.tenantId);
    } catch (e: unknown) {
      const err = e as { statusCode?: number; code?: string };
      return reply.code(err.statusCode ?? 403).send({ error: err.code ?? 'FORBIDDEN' });
    }

    const parsed = setupRunnersSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Invalid input',
      });
    }

    const { extensionNumbers } = parsed.data;
    const db = getDb();

    // Find first active PBX for tenant
    const pbxRow = await db
      .select({ id: pbxCredentials.id })
      .from(pbxCredentials)
      .where(and(eq(pbxCredentials.tenantId, tenantId), eq(pbxCredentials.isActive, true)))
      .limit(1);

    if (!pbxRow[0]) {
      return reply.code(400).send({ error: 'NO_PBX', message: 'No active PBX found for this tenant' });
    }
    const pbxCredId = pbxRow[0].id;

    const created: string[] = [];
    const skipped: string[] = [];
    const errors: Array<{ extension: string; reason: string }> = [];

    for (const extNum of extensionNumbers) {
      try {
        // Look up the extension in cache
        const extRows = await db
          .select()
          .from(pbxExtensions)
          .where(
            and(
              eq(pbxExtensions.pbxCredentialId, pbxCredId),
              eq(pbxExtensions.extensionNumber, extNum),
            ),
          )
          .limit(1);

        const ext = extRows[0];
        if (!ext) {
          skipped.push(extNum);
          continue;
        }

        // Check if runner already exists for this extension + pbx
        const existingRunner = await db
          .select({ id: runners.id })
          .from(runners)
          .where(
            and(
              eq(runners.pbxCredentialId, pbxCredId),
              eq(runners.extensionNumber, extNum),
            ),
          )
          .limit(1);

        if (existingRunner[0]) {
          skipped.push(extNum);
          continue;
        }

        // Auto-link userId if user exists with matching email
        let userId: string | null = null;
        if (ext.email) {
          const userRows = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, ext.email.toLowerCase()))
            .limit(1);
          if (userRows[0]) {
            userId = userRows[0].id;
          }
        }

        await db.insert(runners).values({
          tenantId,
          pbxCredentialId: pbxCredId,
          userId,
          entraEmail: ext.email || '',
          extensionNumber: extNum,
          allowedDeptIds: [], // all allowed
          createdBy: ctx.email,
        });

        created.push(extNum);
      } catch (e) {
        errors.push({ extension: extNum, reason: (e as Error).message });
      }
    }

    // Auto-promote user to Manager if currently a runner
    let sessionToken: string | undefined;
    const userRows = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);
    const currentUser = userRows[0];

    if (currentUser && (currentUser.role === 'runner' || !currentUser.role)) {
      // Promote to admin
      await db
        .update(users)
        .set({ role: 'admin' })
        .where(eq(users.id, ctx.userId));

      // Grant admin access to this tenant
      await db
        .insert(managerTenants)
        .values({
          userId: ctx.userId,
          tenantId,
          assignedBy: ctx.userId,
        })
        .onConflictDoNothing();

      // Issue new session token with admin role
      sessionToken = createSessionToken({
        type: 'session',
        userId: ctx.userId,
        email: ctx.email,
        role: 'admin',
        tenantId,
        runnerId: null,
        emailVerified: true,
        pbxFqdn: null,
        extensionNumber: null,
        entraEmail: null,
        tid: null,
        oid: null,
      });
    }

    return reply.send({ created, skipped, errors, ...(sessionToken ? { sessionToken } : {}) });
  });

  // ── POST /setup/invite ─────────────────────────────────────────────────────

  fastify.post('/setup/invite', async (request, reply) => {
    const ctx = request.setupContext!;
    let tenantId: string;
    try {
      tenantId = await assertTenantAdmin(ctx.email, ctx.tenantId);
    } catch (e: unknown) {
      const err = e as { statusCode?: number; code?: string };
      return reply.code(err.statusCode ?? 403).send({ error: err.code ?? 'FORBIDDEN' });
    }

    const parsed = setupInviteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Invalid input',
      });
    }

    const { mode } = parsed.data;

    if (mode === 'link') {
      return reply.send({
        link: `https://runner.tcx-hub.com/register?company=${tenantId}`,
      });
    }

    // mode === 'email': send invite emails to all runners with emails
    const db = getDb();
    const tenantRunners = await db
      .select({ entraEmail: runners.entraEmail })
      .from(runners)
      .where(and(eq(runners.tenantId, tenantId), eq(runners.isActive, true)));

    // Get tenant name for the invite email
    const tenantRows = await db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    const tenantName = tenantRows[0]?.name ?? 'your company';

    let sent = 0;
    for (const r of tenantRunners) {
      if (r.entraEmail) {
        void sendInviteEmail(r.entraEmail, tenantId, tenantName);
        sent++;
      }
    }

    return reply.send({ sent });
  });
}
