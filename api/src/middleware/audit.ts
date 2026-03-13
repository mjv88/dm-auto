/**
 * src/middleware/audit.ts
 *
 * writeAuditLog — fire-and-forget audit writer.
 *
 * Design constraints (§14):
 *   - Non-blocking: schedules the DB write via setImmediate so the route
 *     handler returns before the insert completes.
 *   - Never throws: errors from the DB are caught and logged to stderr;
 *     they must never propagate to the caller.
 *   - Captures all §14 fields: runnerId, entraEmail, pbxFqdn,
 *     extensionNumber, fromDeptId, toDeptId, status, errorCode (→ errorMessage),
 *     ipAddress, userAgent, deviceId (x-intune-device-id), durationMs.
 *     ipAddress and userAgent are captured for completeness; deviceId is
 *     persisted to the DB.
 */

import type { FastifyRequest } from 'fastify';
import { getDb } from '../db/index.js';
import { auditLog } from '../db/schema.js';

export interface AuditParams {
  runnerId:        string;          // UUID from runners table
  entraEmail:      string;
  pbxFqdn:         string;
  extensionNumber: string;
  fromDeptId:      string | null;   // null when dept context is unknown
  fromDeptName:    string | null;
  toDeptId:        string;
  toDeptName:      string | null;
  status:          'success' | 'failed' | 'denied';
  errorCode:       string | null;   // stored as error_message in DB
  durationMs:      number;
}

/**
 * Schedules an audit_log row to be written after the current event-loop tick.
 * Returns immediately so the route handler is not blocked.
 * Any DB error is silently swallowed (logged to stderr only).
 */
export function writeAuditLog(
  request: FastifyRequest,
  params: AuditParams,
): Promise<void> {
  // Capture volatile request fields synchronously — the request object may be
  // recycled by Fastify before the deferred write runs.
  const ipAddress = request.ip ?? null;
  const userAgent = (request.headers['user-agent'] as string | undefined) ?? null;
  const deviceId  = (request.headers['x-intune-device-id'] as string | undefined) ?? null;

  // Defer the DB write so the caller (route handler) is not blocked.
  setImmediate(() => {
    const db = getDb();
    db.insert(auditLog)
      .values({
        runnerId:        params.runnerId,
        entraEmail:      params.entraEmail,
        pbxFqdn:         params.pbxFqdn,
        extensionNumber: params.extensionNumber,
        fromDeptId:      params.fromDeptId ?? null,
        fromDeptName:    params.fromDeptName ?? null,
        toDeptId:        params.toDeptId,
        toDeptName:      params.toDeptName ?? null,
        status:          params.status,
        errorMessage:    params.errorCode ?? null,
        ipAddress,
        userAgent,
        deviceId,
        durationMs:      params.durationMs,
      })
      .catch((err: unknown) => {
        // Audit failures must never crash the server or affect the response.
        console.error('[audit] failed to write audit log entry:', err);
      });
  });

  // Resolve immediately — the insert is in-flight via setImmediate.
  return Promise.resolve();
}
