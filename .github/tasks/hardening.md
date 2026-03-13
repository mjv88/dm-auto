Read RUNNER_APP_SPEC.md section §15 (Security Requirements) completely.
Read all existing src/ files.

Your task: Security hardening and edge case coverage.

Required deliverables:

- src/middleware/security.ts
  CORS: only allow NEXT_PUBLIC_APP_URL origin
  HSTS: max-age=31536000; includeSubDomains
  CSP: default-src 'self'; connect-src 'self' https://login.microsoftonline.com
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Register all headers on every response

- src/utils/validate.ts
  validateFqdn(fqdn: string): Promise<boolean>
  Must check against pbx_credentials whitelist
  Regex pre-check: /^[a-z0-9.-]+\.[a-z]{2,}$/
  All Zod schemas for every request body (from §5)

- Update all routes to use Zod validation
  Any invalid input → 400 with structured error
  FQDN parameter always run through validateFqdn()

- src/xapi/client.ts (update)
  Add retry logic: 3 attempts, exponential backoff (1s, 2s, 4s)
  Add timeout: 10 seconds per xAPI call
  Handle old 3CX v18: fallback to PUT if PATCH returns 405

- tests/security/
  - Test: non-whitelisted FQDN rejected before any network call
  - Test: malformed FQDN rejected by regex
  - Test: SQL injection attempt in extension number rejected by Zod
  - Test: CORS rejects unknown origin
  - Test: rate limit headers present on all responses

Commit to feature/hardening.
Open PR: "feat: security hardening and input validation"
Update BUILD_STATE.json: hardening.status = "complete"
