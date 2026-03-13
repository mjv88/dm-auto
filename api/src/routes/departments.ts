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
import { runners, deptCache } from '../db/schema.js';
import { authenticate } from '../middleware/authenticate.js';
import { XAPIClient } from '../xapi/client.js';

export async function departmentRoutes(fastify: FastifyInstance): Promise<void> {
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
            eq(runners.id, session.runnerId),
            eq(runners.tenantId, session.tenantId),
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
        xapiClient = await XAPIClient.create(session.pbxFqdn);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      // 3. Get current group from xAPI
      let currentGroupId: number;
      try {
        const userResult = await xapiClient.getUserByNumber(session.extensionNumber);
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
