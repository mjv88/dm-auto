Read RUNNER_APP_SPEC.md sections §5, §13, §14, §15 completely.

Your task: Write complete integration tests covering the full request lifecycle.

Required deliverables:

- tests/integration/auth.test.ts
  Uses supertest against real Fastify instance
  Real DB (test PostgreSQL via docker-compose.test.yml)
  Mocked: Microsoft token validation, Entra Graph, xAPI HTTP calls
  Tests:
    ✓ Valid runner, single PBX → direct mode response
    ✓ Valid runner, multi-PBX, no fqdn param → select mode response
    ✓ Valid runner, multi-PBX, fqdn param → direct mode response
    ✓ Not in Entra group → 403 NOT_A_RUNNER
    ✓ In Entra group, no DB row → 403 RUNNER_NOT_CONFIGURED
    ✓ FQDN param doesn't match runner → 403 PBX_NOT_AUTHORIZED

- tests/integration/switch.test.ts
  Tests:
    ✓ Valid switch → 200, audit log written, correct response
    ✓ Switch to same dept → 400 SAME_DEPT
    ✓ Dept not in allowedDeptIds → 403 DEPT_NOT_ALLOWED
    ✓ xAPI unreachable → 503 PBX_UNAVAILABLE, audit log failure row
    ✓ Rate limit exceeded → 429 RATE_LIMITED
    ✓ Expired session token → 401 TOKEN_EXPIRED

- docker-compose.test.yml
  Spins up postgres:16-alpine with test DB
  Used by CI for integration tests

- package.json (update)
  Add: "test:integration": "docker-compose -f docker-compose.test.yml up -d && jest tests/integration && docker-compose -f docker-compose.test.yml down"

Commit to feature/integration-tests.
Open PR: "test: complete integration test suite"
Update BUILD_STATE.json: tests.status = "complete"
