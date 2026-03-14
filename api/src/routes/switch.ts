/**
 * src/routes/switch.ts
 *
 * POST /runner/switch
 *
 * Switches the authenticated runner to a new department.
 *   1. Validate session JWT (authenticate middleware)
 *   2. Validate request body — targetDeptId must be a positive integer
 *   3. Load runner from DB (tenantId filter prevents cross-tenant access)
 *   4. Confirm targetDeptId is in runner.allowedDeptIds
 *   5. Create xAPI client, get current userId + groupId
 *   6. Guard against switching to the same department (SAME_DEPT)
 *   7. Call xapi.patchUserGroup to move the user
 *   8. Write audit_log entry (success or failure)
 *   9. Return { success, previousDept, currentDept, switchedAt }
 */

import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { runners } from '../db/schema.js';
import { authenticate } from '../middleware/authenticate.js';
import { writeAuditLog } from '../middleware/audit.js';
import { XAPIClient, PBXUnavailableError } from '../xapi/client.js';
import { switchBodySchema } from '../utils/validate.js';

export async function switchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/runner/switch',
    { preHandler: authenticate },
    async (request, reply) => {
      const startTime = Date.now();
      const session = request.runnerContext!;

      // 1. Validate request body
      const parseResult = switchBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(409).send({
          error: 'VALIDATION_ERROR',
          message: parseResult.error.message,
        });
      }
      const { targetDeptId } = parseResult.data;

      // 2. Load runner from DB (tenantId scoping prevents cross-tenant leakage)
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

      // 3. Confirm targetDeptId is in runner.allowedDeptIds (stored as strings)
      if (!runner.allowedDeptIds.includes(String(targetDeptId))) {
        await writeAuditLog(request, {
          runnerId:        runner.id,
          entraEmail:      session.entraEmail ?? '',
          pbxFqdn:         session.pbxFqdn ?? '',
          extensionNumber: session.extensionNumber ?? '',
          fromDeptId:      null,
          fromDeptName:    null,
          toDeptId:        String(targetDeptId),
          toDeptName:      null,
          status:          'denied',
          errorCode:       'DEPT_NOT_ALLOWED',
          durationMs:      Date.now() - startTime,
        });
        return reply.code(403).send({ error: 'DEPT_NOT_ALLOWED' });
      }

      // 4. Create xAPI client (validates FQDN against whitelist)
      let xapiClient: XAPIClient;
      try {
        xapiClient = await XAPIClient.create(session.pbxFqdn!);
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      // 5. Get current user info
      let userId: number;
      let currentGroupId: number;
      try {
        const userResult = await xapiClient.getUserByNumber(session.extensionNumber!);
        userId = userResult.userId;
        currentGroupId = userResult.currentGroupId;
      } catch {
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      // 6. Guard: same department
      if (currentGroupId === targetDeptId) {
        return reply.code(409).send({
          error: 'SAME_DEPT',
          message: "You're already in this department.",
        });
      }

      // 7. Fetch group names for the response (best-effort; use IDs as fallback)
      let groups: Array<{ id: number; name: string }> = [];
      try {
        groups = await xapiClient.getGroups();
      } catch {
        // Non-fatal — we can still switch, just won't have names
      }

      const prevDept = groups.find((g) => g.id === currentGroupId) ?? {
        id: currentGroupId,
        name: String(currentGroupId),
      };
      const nextDept = groups.find((g) => g.id === targetDeptId) ?? {
        id: targetDeptId,
        name: String(targetDeptId),
      };

      // 8. Perform the switch
      try {
        await xapiClient.patchUserGroup(userId, targetDeptId);
      } catch (err) {
        const errorCode =
          err instanceof PBXUnavailableError ? 'PBX_UNAVAILABLE' : 'INTERNAL_ERROR';
        await writeAuditLog(request, {
          runnerId:        runner.id,
          entraEmail:      session.entraEmail ?? '',
          pbxFqdn:         session.pbxFqdn ?? '',
          extensionNumber: session.extensionNumber ?? '',
          fromDeptId:      String(currentGroupId),
          fromDeptName:    prevDept.name,
          toDeptId:        String(targetDeptId),
          toDeptName:      nextDept.name,
          status:          'failed',
          errorCode,
          durationMs:      Date.now() - startTime,
        });
        return reply.code(503).send({ error: 'PBX_UNAVAILABLE' });
      }

      // 9. Audit: success
      await writeAuditLog(request, {
        runnerId:        runner.id,
        entraEmail:      session.entraEmail ?? '',
        pbxFqdn:         session.pbxFqdn ?? '',
        extensionNumber: session.extensionNumber ?? '',
        fromDeptId:      String(currentGroupId),
        fromDeptName:    prevDept.name,
        toDeptId:        String(targetDeptId),
        toDeptName:      nextDept.name,
        status:          'success',
        errorCode:       null,
        durationMs:      Date.now() - startTime,
      });

      return reply.send({
        success:      true,
        previousDept: { id: prevDept.id, name: prevDept.name },
        currentDept:  { id: nextDept.id, name: nextDept.name },
        switchedAt:   new Date().toISOString(),
      });
    },
  );
}
