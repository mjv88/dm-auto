/**
 * src/routes/departments.ts
 *
 * GET /runner/departments
 *
 * Returns the runner's current department and the list of allowed departments.
 *   1. Validate session JWT (authenticate middleware)
 *   2. Load runner from DB (tenantId scoping)
 *   3. Create xAPI client, get current groupId via getUserByNumber
 *   4. Resolve dept names: try dept_cache first, fall back to xAPI
 *   5. Return { currentDeptId, currentDeptName, allowedDepts }
 */

import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { runners, deptCache, pbxExtensions, pbxCredentials } from '../db/schema.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { XAPIClient } from '../xapi/client.js';

export async function departmentRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /runner/profile ─────────────────────────────────────────────────
  fastify.get('/runner/profile', { preHandler: requireAuth }, async (request, reply) => {
    const session = request.session!;
    if (!session.runnerId) {
      return reply.send({ displayName: session.email, extensionNumber: session.extensionNumber });
    }

    const db = getDb();

    // Try cache first
    const extRows = await db
      .select({ displayName: pbxExtensions.displayName })
      .from(pbxExtensions)
      .innerJoin(pbxCredentials, eq(pbxExtensions.pbxCredentialId, pbxCredentials.id))
      .where(
        and(
          eq(pbxCredentials.pbxFqdn, session.pbxFqdn ?? ''),
          eq(pbxExtensions.extensionNumber, session.extensionNumber ?? ''),
        ),
      )
      .limit(1);

    if (extRows[0]?.displayName) {
      return reply.send({ displayName: extRows[0].displayName, extensionNumber: session.extensionNumber });
    }

    // Cache miss — look up runner record for the entraEmail (PBX email)
    // and try pbx_extensions by that email
    const runnerRows = await db
      .select({ entraEmail: runners.entraEmail })
      .from(runners)
      .where(eq(runners.id, session.runnerId!))
      .limit(1);

    if (runnerRows[0]?.entraEmail) {
      // Try finding by PBX email in extensions
      const byEmail = await db
        .select({ displayName: pbxExtensions.displayName })
        .from(pbxExtensions)
        .where(eq(pbxExtensions.email, runnerRows[0].entraEmail))
        .limit(1);
      if (byEmail[0]?.displayName) {
        return reply.send({ displayName: byEmail[0].displayName, extensionNumber: session.extensionNumber });
      }
    }

    // Last resort — fetch from xAPI directly
    if (session.pbxFqdn && session.extensionNumber) {
      try {
        const { getXAPIToken } = await import('../xapi/auth.js');
        const token = await getXAPIToken(session.pbxFqdn);
        const resp = await fetch(
          `https://${session.pbxFqdn}/xapi/v1/Users?$filter=Number eq '${session.extensionNumber}'&$select=DisplayName`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (resp.ok) {
          const data = await resp.json() as { value: Array<{ DisplayName: string }> };
          if (data.value[0]?.DisplayName) {
            return reply.send({ displayName: data.value[0].DisplayName, extensionNumber: session.extensionNumber });
          }
        }
      } catch {
        // xAPI unavailable
      }
    }

    return reply.send({ displayName: session.email, extensionNumber: session.extensionNumber });
  });
  fastify.get(
    '/runner/departments',
    { preHandler: authenticate },
    async (request, reply) => {
      const session = request.runnerContext!;

      // 1. Load runner from DB (tenant-scoped)
      const db = getDb();
      const runnerRows = await db
        .select()
        .from(runners)
        .where(
          and(
            eq(runners.id, session.runnerId!),
            eq(runners.tenantId, session.tenantId!),
            eq(runners.isActive, true),
          ),
        )
        .limit(1);

      if (runnerRows.length === 0) {
        return reply.code(403).send({ error: 'RUNNER_NOT_FOUND' });
      }
      const runner = runnerRows[0];

      // 2. Create xAPI client
      let xapiClient: XAPIClient;
      try {
        xapiClient = await XAPIClient.create(session.pbxFqdn!);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      // 3. Get current group from xAPI
      let currentGroupId: number;
      try {
        const userResult = await xapiClient.getUserByNumber(session.extensionNumber!);
        currentGroupId = userResult.currentGroupId;
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      // 4. Resolve department names — try cache, fall back to xAPI
      let deptMap: Map<string, string>;

      const cacheRows = await db
        .select({ deptId: deptCache.deptId, deptName: deptCache.deptName })
        .from(deptCache)
        .where(eq(deptCache.pbxCredentialId, runner.pbxCredentialId));

      if (cacheRows.length > 0) {
        deptMap = new Map(cacheRows.map((r) => [r.deptId, r.deptName]));
      } else {
        // Fall back to xAPI and populate cache for future requests
        let groups: Array<{ id: number; name: string }> = [];
        try {
          groups = await xapiClient.getGroups();
          if (groups.length > 0) {
            await db
              .insert(deptCache)
              .values(
                groups.map((g) => ({
                  pbxCredentialId: runner.pbxCredentialId,
                  deptId:          String(g.id),
                  deptName:        g.name,
                })),
              )
              .onConflictDoNothing();
          }
        } catch {
          // Cache population failure is non-fatal
        }
        deptMap = new Map(groups.map((g) => [String(g.id), g.name]));
      }

      // 5. Build response
      const currentDeptName = deptMap.get(String(currentGroupId)) ?? String(currentGroupId);

      const allowedDepts = runner.allowedDeptIds.map((idStr) => ({
        id:   Number(idStr),
        name: deptMap.get(idStr) ?? idStr,
      }));

      return reply.send({
        currentDeptId:   currentGroupId,
        currentDeptName,
        allowedDepts,
      });
    },
  );
}
