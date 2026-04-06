/**
 * src/routes/auth.ts
 *
 * POST /runner/auth
 *
 * Authenticates a runner via Microsoft SSO ID token.
 * Full flow:
 *   1. Validate Microsoft ID token → extract { email, tid, oid }
 *   2. Look up tenant in DB by tid → get entra_group_id
 *      If not found or inactive → 403 TENANT_NOT_REGISTERED
 *   3. Check Entra group membership using tenant's group_id
 *      If not member → 403 NOT_IN_RUNNERS_GROUP
 *   4. Look up runner(s) in DB by email + tenant_id
 *      If none found and autoProvisionRunners is enabled:
 *        a. Query each PBX for users matching this email
 *        b. Auto-create runner records with all departments allowed
 *      If still none found → 403 RUNNER_NOT_FOUND
 *   5. Multiple PBX FQDNs → return { mode: 'select', options }
 *      Single PBX → return { mode: 'direct', runner, sessionToken }
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { tenants, runners, pbxCredentials, users } from '../db/schema.js';
import { validateMicrosoftToken } from '../middleware/authenticate.js';
import { checkEntraGroup } from '../entra/groupCheck.js';
import { createSessionToken } from '../middleware/session.js';
import { writeAuditLog } from '../middleware/audit.js';
import { authBodySchema } from '../utils/validate.js';
import { XAPIClient } from '../xapi/client.js';
import { SESSION_COOKIE_OPTS } from '../utils/cookieOpts.js';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/runner/auth', async (request, reply) => {
    const startTime = Date.now();

    // 1. Validate request body
    const parseResult = authBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: parseResult.error.message,
      });
    }
    const { idToken, pbxFqdn: requestedFqdn } = parseResult.data;
    // 2. Validate Microsoft ID token
    let tokenPayload: Awaited<ReturnType<typeof validateMicrosoftToken>>;
    try {
      tokenPayload = await validateMicrosoftToken(idToken);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'TOKEN_EXPIRED') {
        return reply.code(401).send({ error: 'TOKEN_EXPIRED' });
      }
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid ID token' });
    }

    const { email, tid, oid, name: displayName } = tokenPayload;

    // Look up user role from users table (if registered)
    const db = getDb();
    let userRole: 'admin' | 'manager' | 'runner' = 'runner';
    let userId: string | null = null;
    {
      const userRows = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);
      if (userRows[0]) {
        userId = userRows[0].id;
        userRole = (userRows[0].role as 'admin' | 'manager' | 'runner') ?? 'runner';
      }
    }

    // 3. Look up tenant in DB by tid
    const tenantRows = await db
      .select()
      .from(tenants)
      .where(and(eq(tenants.entraTenantId, tid), eq(tenants.isActive, true)))
      .limit(1);

    if (tenantRows.length === 0) {
      request.log.warn({ email, method: 'entra_sso', ip: request.ip, reason: 'tenant_not_registered' }, 'Runner auth failed');
      return reply.code(403).send({ error: 'TENANT_NOT_REGISTERED' });
    }
    const tenant = tenantRows[0];

    // 4. Check Entra group membership using tenant's group_id from DB
    let isMember: boolean;
    try {
      isMember = await checkEntraGroup(oid, tenant.entraGroupId);
    } catch {
      request.log.warn({ email, method: 'entra_sso', ip: request.ip, reason: 'group_check_failed' }, 'Runner auth failed');
      return reply
        .code(503)
        .send({ error: 'INTERNAL_ERROR', message: 'Group check failed' });
    }

    if (!isMember) {
      request.log.warn({ email, method: 'entra_sso', ip: request.ip, reason: 'not_in_runners_group' }, 'Runner auth failed');
      return reply.code(403).send({ error: 'NOT_IN_RUNNERS_GROUP' });
    }

    // 5. Look up runner(s) by email + tenant_id
    const runnerRows = await db
      .select({
        id: runners.id,
        extensionNumber: runners.extensionNumber,
        allowedDeptIds: runners.allowedDeptIds,
        pbxFqdn: pbxCredentials.pbxFqdn,
        pbxName: pbxCredentials.pbxName,
        pbxCredentialId: runners.pbxCredentialId,
      })
      .from(runners)
      .innerJoin(pbxCredentials, eq(runners.pbxCredentialId, pbxCredentials.id))
      .where(
        and(
          eq(runners.entraEmail, email),
          eq(runners.tenantId, tenant.id),
          eq(runners.isActive, true),
          eq(pbxCredentials.isActive, true),
        ),
      );

    // 5b. Auto-provision runner if tenant has it enabled and no runner exists
    if (runnerRows.length === 0 && tenant.autoProvisionRunners) {
      // Get all active PBX credentials for this tenant
      const tenantPbxCreds = await db
        .select({ id: pbxCredentials.id, pbxFqdn: pbxCredentials.pbxFqdn, pbxName: pbxCredentials.pbxName })
        .from(pbxCredentials)
        .where(and(eq(pbxCredentials.tenantId, tenant.id), eq(pbxCredentials.isActive, true)));

      for (const cred of tenantPbxCreds) {
        try {
          const client = await XAPIClient.create(cred.pbxFqdn);
          const pbxUsers = await client.getAllUsers();
          const match = pbxUsers.find(
            (u) => u.email.toLowerCase() === email.toLowerCase(),
          );
          if (!match) continue;

          // Fetch all departments to allow everything by default
          const groups = await client.getGroups();
          const allDeptIds = groups.map((g) => String(g.id));

          // Create runner record
          const [newRunner] = await db
            .insert(runners)
            .values({
              tenantId:        tenant.id,
              pbxCredentialId: cred.id,
              entraEmail:      email,
              extensionNumber: match.number,
              allowedDeptIds:  allDeptIds,
              outboundCallerId: match.outboundCallerId ?? null,
              isActive:        true,
              createdBy:       'auto-provision',
            })
            .onConflictDoNothing()
            .returning({
              id: runners.id,
              extensionNumber: runners.extensionNumber,
              allowedDeptIds: runners.allowedDeptIds,
              pbxCredentialId: runners.pbxCredentialId,
            });

          if (newRunner) {
            runnerRows.push({
              id:              newRunner.id,
              extensionNumber: newRunner.extensionNumber,
              allowedDeptIds:  newRunner.allowedDeptIds,
              pbxFqdn:         cred.pbxFqdn,
              pbxName:         cred.pbxName,
              pbxCredentialId: newRunner.pbxCredentialId,
            });
          }
        } catch (err) {
          // PBX unreachable or xAPI error — skip this PBX, try others
          request.log.warn({ pbxFqdn: cred.pbxFqdn, err }, 'Auto-provision: failed to query PBX');
        }
      }
    }

    if (runnerRows.length === 0) {
      request.log.warn({ email, method: 'entra_sso', ip: request.ip, reason: 'runner_not_found' }, 'Runner auth failed');
      return reply.code(403).send({ error: 'RUNNER_NOT_FOUND' });
    }

    // 6. If a specific pbxFqdn was requested, filter to that PBX
    if (requestedFqdn) {
      const match = runnerRows.find((r) => r.pbxFqdn === requestedFqdn);
      if (!match) {
        void writeAuditLog(request, {
          runnerId:        runnerRows[0].id,
          entraEmail:      email,
          pbxFqdn:         requestedFqdn,
          extensionNumber: runnerRows[0].extensionNumber,
          fromDeptId:      null,
          fromDeptName:    null,
          toDeptId:        '',
          toDeptName:      null,
          status:          'denied',
          errorCode:       'PBX_NOT_AUTHORIZED',
          durationMs:      Date.now() - startTime,
        });
        return reply.code(403).send({ error: 'PBX_NOT_AUTHORIZED' });
      }
      const sessionToken = createSessionToken({
        type: 'session',
        userId: userId ?? match.id,
        email: email,
        role: userRole,
        tenantId: tenant.id,
        runnerId: match.id,
        emailVerified: true, // Entra users are always verified
        pbxFqdn: match.pbxFqdn,
        extensionNumber: match.extensionNumber,
        entraEmail: email,
        tid: tid,
        oid: oid,
      });
      reply.setCookie('runner_session', sessionToken, SESSION_COOKIE_OPTS);
      request.log.info({ email, method: 'entra_sso', ip: request.ip }, 'Runner auth successful');
      void db.update(runners).set({ lastLoginAt: sql`now()` }).where(eq(runners.id, match.id));
      return reply.send({
        mode: 'direct',
        runner: {
          id: match.id,
          displayName,
          email,
          pbxFqdn: match.pbxFqdn,
          pbxName: match.pbxName,
          extensionNumber: match.extensionNumber,
          allowedDeptIds: match.allowedDeptIds,
        },
        sessionToken,
      });
    }

    // 7. Multiple PBXes → selection required
    if (runnerRows.length > 1) {
      return reply.send({
        mode: 'select',
        options: runnerRows.map((r) => ({
          pbxFqdn: r.pbxFqdn,
          pbxName: r.pbxName,
          extensionNumber: r.extensionNumber,
        })),
      });
    }

    // 8. Single PBX → issue session token
    const single = runnerRows[0];
    const sessionToken = createSessionToken({
      type: 'session',
      userId: userId ?? single.id,
      email: email,
      role: userRole,
      tenantId: tenant.id,
      runnerId: single.id,
      emailVerified: true, // Entra users are always verified
      pbxFqdn: single.pbxFqdn,
      extensionNumber: single.extensionNumber,
      entraEmail: email,
      tid: tid,
      oid: oid,
    });

    reply.setCookie('runner_session', sessionToken, SESSION_COOKIE_OPTS);
    request.log.info({ email, method: 'entra_sso', ip: request.ip }, 'Runner auth successful');
    void db.update(runners).set({ lastLoginAt: sql`now()` }).where(eq(runners.id, single.id));
    return reply.send({
      mode: 'direct',
      runner: {
        id: single.id,
        displayName,
        email,
        pbxFqdn: single.pbxFqdn,
        pbxName: single.pbxName,
        extensionNumber: single.extensionNumber,
        allowedDeptIds: single.allowedDeptIds,
      },
      sessionToken,
    });
  });
}
