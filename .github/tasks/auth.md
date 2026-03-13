Read RUNNER_APP_SPEC.md sections §7 and §8 completely.

Your task: Implement Microsoft SSO validation and Entra group check.

IMPORTANT: This is a MULTI-TENANT app with a single app registration in the platform tenant.
Customer tenant IDs, group IDs, and PBX mappings come from the DATABASE (tenants table), NOT from env vars.
The only Entra env vars are for the app registration itself (shared across all customers).

Environment variables (same for all deployments):
- ENTRA_CLIENT_ID — Platform's multi-tenant app registration
- ENTRA_CLIENT_SECRET — For Graph API calls to any customer tenant
- JWT_SECRET — 64-char random string for session tokens
- JWT_EXPIRES_IN — Token expiry (default "8h")

Auth flow:
1. User signs in via Microsoft (any org — multi-tenant app)
2. Token contains tid (tenant ID) + email
3. API looks up tenant in DB by tid → gets group_id, active status
4. If tenant not found or inactive → reject (TENANT_NOT_REGISTERED)
5. Check user's Entra group membership in THEIR tenant using Graph API
6. Look up runner(s) in DB by email + tenant_id
7. Return session token + runner context

Required deliverables:

- src/middleware/authenticate.ts
  validateMicrosoftToken(idToken: string): Promise<TokenPayload>
  Uses jwks-rsa + jsonwebtoken
  JWKS URI: https://login.microsoftonline.com/common/discovery/v2.0/keys (multi-tenant)
  Validates:
    - aud === ENTRA_CLIENT_ID (from env — it's YOUR app)
    - iss matches Microsoft pattern (multi-tenant: any tenant issuer)
    - exp not expired
  Returns: { email, name, tid, oid }

- src/entra/groupCheck.ts
  checkEntraGroup(oid: string, tenantGroupId: string): Promise<boolean>
  Uses Microsoft Graph API: POST /v1.0/users/{oid}/checkMemberGroups
  Group ID comes from the tenants table (passed in), NOT from env
  Caches result for 5 minutes (in-memory Map with TTL, key = oid+groupId)
  Gets Graph token via client credentials flow

- src/entra/graphAuth.ts
  getGraphToken(): Promise<string>
  Client credentials flow using ENTRA_CLIENT_ID + ENTRA_CLIENT_SECRET from env
  Token endpoint: https://login.microsoftonline.com/common/oauth2/v2.0/token
  Scope: https://graph.microsoft.com/.default
  Caches access token until 5 min before expiry

- src/middleware/session.ts
  createSessionToken(payload: RunnerSession): string
  validateSessionToken(token: string): RunnerSession
  Uses JWT_SECRET and JWT_EXPIRES_IN from env

- src/routes/auth.ts
  POST /runner/auth
  Body: { idToken: string }
  1. Validate Microsoft ID token → extract { email, tid, oid }
  2. Look up tenant in DB by tid → get entra_group_id
     If not found → 403 TENANT_NOT_REGISTERED
  3. Check Entra group membership using tenant's group_id
     If not member → 403 NOT_IN_RUNNERS_GROUP
  4. Look up runner(s) in DB by email + tenant_id
     If no runners → 403 RUNNER_NOT_FOUND
  5. If multiple PBX FQDNs → return { mode: 'select', options }
  6. If single PBX → return { mode: 'direct', runner, sessionToken }

- src/routes/admin/tenants.ts
  All routes require: valid session + admin_emails check on tenant
  GET /admin/tenants/me — Get current tenant config
  PUT /admin/tenants/me — Update tenant (entra_group_id, name)
  The tenant row is auto-created on first admin login if it doesn't exist

- src/routes/admin/pbx.ts
  All routes require: valid session + admin check
  GET /admin/pbx — List PBX credentials for tenant
  POST /admin/pbx — Add PBX (fqdn, name, auth_mode, credentials)
    Validates connectivity by attempting xAPI/user auth before saving
    Encrypts credentials before storing
  PUT /admin/pbx/:id — Update PBX credentials
  DELETE /admin/pbx/:id — Soft-delete (set is_active=false)

- src/routes/admin/runners.ts
  All routes require: valid session + admin check
  GET /admin/runners — List runners for tenant (filterable by pbx, active, email)
  POST /admin/runners — Add runner (email, extension, pbx_id, allowed_dept_ids)
    Validates extension exists on PBX via xAPI before saving
  PUT /admin/runners/:id — Update runner
  DELETE /admin/runners/:id — Soft-delete

- tests/auth/
  - Test: valid Microsoft token validates correctly
  - Test: expired token throws TOKEN_EXPIRED
  - Test: unknown tenant ID → TENANT_NOT_REGISTERED
  - Test: user not in Entra group → NOT_IN_RUNNERS_GROUP
  - Test: runner not found → RUNNER_NOT_FOUND
  - Test: multi-PBX runner returns select mode
  - Test: group check uses tenant's group_id from DB (not env)
  - Test: group check result is cached for 5 min
  - Test: admin routes require admin_emails membership
  - Test: PBX credential add validates connectivity
  - Test: PBX credentials are encrypted in DB
  All Microsoft/Graph calls mocked with nock.

Commit to branch feature/auth.
Open PR: "feat: Microsoft SSO validation, Entra group check, admin self-service"
Update BUILD_STATE.json: auth.status = "complete"
