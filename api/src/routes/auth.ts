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
 *      If none found → 403 RUNNER_NOT_FOUND
 *   5. Multiple PBX FQDNs → return { mode: 'select', options }
 *      Single PBX → return { mode: 'direct', runner, sessionToken }
 */

import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { tenants, runners, pbxCredentials } from '../db/schema.js';
import { validateMicrosoftToken } from '../middleware/authenticate.js';
import { checkEntraGroup } from '../entra/groupCheck.js';
import { createSessionToken } from '../middleware/session.js';
import { writeAuditLog } from '../middleware/audit.js';
import { authBodySchema } from '../utils/validate.js';

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

    // 3. Look up tenant in DB by tid
    const db = getDb();
    const tenantRows = await db
      .select()
      .from(tenants)
      .where(and(eq(tenants.entraTenantId, tid), eq(tenants.isActive, true)))
      .limit(1);

    if (tenantRows.length === 0) {
      return reply.code(403).send({ error: 'TENANT_NOT_REGISTERED' });
    }
    const tenant = tenantRows[0];

    // 4. Check Entra group membership using tenant's group_id from DB
    let isMember: boolean;
    try {
      isMember = await checkEntraGroup(oid, tenant.entraGroupId);
    } catch {
      return reply
        .code(503)
        .send({ error: 'INTERNAL_ERROR', message: 'Group check failed' });
    }

    if (!isMember) {
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

    if (runnerRows.length === 0) {
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
        userId: match.id,
        email: email,
        role: 'runner',
        tenantId: tenant.id,
        runnerId: match.id,
        emailVerified: true, // Entra users are always verified
        pbxFqdn: match.pbxFqdn,
        extensionNumber: match.extensionNumber,
        entraEmail: email,
        tid: tid,
        oid: oid,
      });
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
      userId: single.id,
      email: email,
      role: 'runner',
      tenantId: tenant.id,
      runnerId: single.id,
      emailVerified: true, // Entra users are always verified
      pbxFqdn: single.pbxFqdn,
      extensionNumber: single.extensionNumber,
      entraEmail: email,
      tid: tid,
      oid: oid,
    });

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
