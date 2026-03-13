Read RUNNER_APP_SPEC.md section §14 (Audit Logging) completely.
Read src/routes/switch.ts — audit writes are currently stubbed.

Your task: Complete the audit logging system.

Required deliverables:

- src/middleware/audit.ts
  writeAuditLog(params: AuditParams): Promise<void>
  Non-blocking: uses setImmediate, never throws
  Captures: all fields from §14 schema
  Extracts device_id from header x-intune-device-id if present

- Update src/routes/switch.ts
  Replace audit stub with real writeAuditLog call
  Write on BOTH success AND failure paths
  On failure: status='failed', errorCode, errorMessage set

- Update src/routes/auth.ts
  Log denied access attempts (status='denied') to audit_log

- tests/audit/audit.test.ts
  - Test: successful switch writes correct audit row
  - Test: failed switch writes failure row with error code
  - Test: audit failure does NOT fail the route (non-blocking)
  - Test: Intune device ID captured from header

Commit to feature/audit.
Open PR: "feat: complete audit logging"
Update BUILD_STATE.json: audit.status = "complete"
