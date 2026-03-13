Read RUNNER_APP_SPEC.md section §5 completely.
All existing src/ files are implemented. Use them.

Your task: Implement all runner-facing API route handlers.
NOTE: Admin routes (tenants, pbx, runners CRUD) are in the auth task. This task covers runner-facing routes only.

All routes are tenant-aware — the session token contains tenantId, and all DB queries filter by it.

Required deliverables:

- src/routes/auth.ts → POST /runner/auth
  (Already implemented in auth phase — verify it exists and works)
  If not present, implement per auth task spec.

- src/routes/switch.ts → POST /runner/switch
  Requires: validateSessionToken middleware
  Extract tenantId + runnerId from session
  Validates targetDeptId is in runner.allowedDeptIds
  Loads PBX credentials for runner's pbx_credential_id (decrypt)
  Calls xapi.patchUserGroup(userId, targetGroupId) using decrypted creds
  Returns previous + current dept (group)
  Writes to audit_log (success or failure, with duration_ms)

- src/routes/departments.ts → GET /runner/departments
  Requires: validateSessionToken middleware
  Extract tenantId + runnerId from session
  Loads runner's PBX creds (decrypt)
  Calls xapi.getUserByNumber() to get currentGroupId
  Returns currentDept + allowedDepts (filtered to runner.allowedDeptIds)
  Uses dept_cache where possible, falls back to xAPI

- src/routes/health.ts → GET /health
  Returns { status, version, db, uptime }
  Checks DB connectivity with 1s timeout
  No auth required

- src/index.ts (update)
  Register all routes (runner-facing + admin from auth phase)
  Register rate limiter (§5 rate limiting spec)
  Register Sentry error handler

- tests/routes/ (one file per route)
  Every success path tested
  Every error code from §13 tested
  DB queries use tenant_id filter (verify no cross-tenant leakage)
  xAPI mocked with nock
  PBX credentials are decrypted correctly in tests

Commit to branch feature/routes.
Open PR: "feat: runner-facing API route handlers"
Update BUILD_STATE.json: routes.status = "complete"
