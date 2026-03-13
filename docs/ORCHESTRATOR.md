# ORCHESTRATOR.md
## 3CX Runner App — Autonomous 24/7 Build Pipeline
**Version:** 1.0.0  
**Model:** claude-sonnet-4-5 (all agents)  
**Trigger:** GitHub Actions (event-driven + scheduled)  
**Human input required:** Zero after bootstrap  

---

## How This Works

```
You bootstrap once (30 minutes).
Then close your laptop.
Claude runs the entire build autonomously.
You wake up to PRs, passing tests, and deployed services.
```

The system is a **state machine**. Each phase:
1. Reads `BUILD_STATE.json` to know where it is
2. Spawns the correct Claude Code sub-agent
3. Sub-agent writes code, runs tests, commits, opens PR
4. GitHub Actions CI validates
5. On pass → auto-merges → updates state → triggers next phase
6. On fail → sub-agent retries with error context (up to 3x)
7. On 3x fail → writes `BLOCKED.md` → notifies you → waits

You only intervene on a genuine blocker. Everything else runs itself.

---

## Bootstrap Checklist (Your 30 Minutes)

Complete these manually before starting the pipeline.

```
Infrastructure:
  [ ] Hetzner CX22 provisioned → note IP
  [ ] Coolify installed on new instance
  [ ] PostgreSQL service created in Coolify
  [ ] runner-api service created (GitHub source, not yet deployed)
  [ ] runner-pwa service created (GitHub source, not yet deployed)
  [ ] DNS records set: runner-api.domain.com, runner.domain.com

GitHub:
  [ ] Repo created: tcx-runner-api (private)
  [ ] Repo created: tcx-runner-pwa (private)
  [ ] Branch protection on main: require PR + passing CI
  [ ] GitHub Actions secrets set (see §SECRETS)

Microsoft Entra:
  [ ] App Registration created: "3CX Runner App"
  [ ] Redirect URI set: https://runner.domain.com/auth/callback
  [ ] "3CX Runners" security group created → note Group ID
  [ ] Client secret created → note value

Seed files committed to each repo:
  [ ] RUNNER_APP_SPEC.md  (the build specification)
  [ ] ORCHESTRATOR.md     (this file)
  [ ] BUILD_STATE.json    (initial state — see below)
  [ ] .env.example
  [ ] .github/workflows/  (all workflow files from §WORKFLOWS)
```

---

## BUILD_STATE.json

This file lives in each repo root. It is the single source of truth for pipeline progress. Agents read it, update it, commit it.

### Initial State (commit this to start the pipeline)

```json
{
  "pipeline": "tcx-runner-api",
  "version": "1.0.0",
  "started_at": null,
  "completed_at": null,
  "current_phase": "PENDING",
  "phases": {
    "scaffold":      { "status": "pending", "attempts": 0, "completed_at": null, "pr_url": null },
    "schema":        { "status": "pending", "attempts": 0, "completed_at": null, "pr_url": null },
    "xapi_client":   { "status": "pending", "attempts": 0, "completed_at": null, "pr_url": null },
    "auth":          { "status": "pending", "attempts": 0, "completed_at": null, "pr_url": null },
    "routes":        { "status": "pending", "attempts": 0, "completed_at": null, "pr_url": null },
    "audit":         { "status": "pending", "attempts": 0, "completed_at": null, "pr_url": null },
    "tests":         { "status": "pending", "attempts": 0, "completed_at": null, "pr_url": null },
    "hardening":     { "status": "pending", "attempts": 0, "completed_at": null, "pr_url": null },
    "integration":   { "status": "pending", "attempts": 0, "completed_at": null, "pr_url": null }
  },
  "blocked": false,
  "blocked_reason": null,
  "last_error": null
}
```

### Status Values

```
pending     → not started yet
running     → agent currently executing
failed      → last attempt failed (will retry)
blocked     → 3 failures, human needed
complete    → merged to main, verified
```

---

## Phase Definitions

Each phase has: a **trigger** (what starts it), a **task prompt** (what the agent reads), **success criteria** (how CI validates it), and **dependencies** (what must be complete first).

---

### Phase 0: SCAFFOLD
**Trigger:** `BUILD_STATE.json` committed with `current_phase: PENDING`  
**Depends on:** Nothing  
**Branch:** `feature/scaffold`

**Agent Task Prompt:**
```
Read RUNNER_APP_SPEC.md sections §3 and §17.
Read the existing BUILD_STATE.json.

Your task: Scaffold the complete project structure.

Create EVERY file and folder listed in §3. 
Files should be stubs with correct imports and TODO comments — 
do not implement logic yet. That comes in later phases.

Required deliverables:
- All folders created
- package.json with exact dependencies listed in §DEPENDENCIES
- tsconfig.json (strict mode)
- Dockerfile (multi-stage, node:20-alpine)
- docker-compose.yml (local dev with postgres)
- .env.example (all vars from §17, values empty)
- drizzle.config.ts
- src/index.ts (Fastify server, no routes yet)
- src/config.ts (zod env validation, all vars)
- All route files as stubs
- All middleware files as stubs
- README.md with setup instructions

After creating all files:
- Run: npm install
- Run: npm run build (must succeed with 0 errors)
- Commit everything to branch feature/scaffold
- Open a PR to main titled "feat: project scaffold"
- Update BUILD_STATE.json: scaffold.status = "complete"
```

**Success Criteria (CI):**
```yaml
- npm install          # zero errors
- npm run build        # TypeScript compiles clean
- npm run lint         # no lint errors
- docker build .       # image builds successfully
```

---

### Phase 1: SCHEMA
**Trigger:** scaffold = complete  
**Depends on:** scaffold  
**Branch:** `feature/schema`

**Agent Task Prompt:**
```
Read RUNNER_APP_SPEC.md section §4 (Database Schema) completely.
Read src/db/schema.ts (currently a stub).

Your task: Implement the complete Drizzle ORM schema and migrations.

Required deliverables:
- src/db/schema.ts: complete Drizzle schema 
  (runners, pbx_credentials, audit_log, dept_cache tables)
  Exactly as specified in §4. No deviations.
- src/db/migrations/0001_initial.sql: raw SQL migration
- src/db/migrate.ts: migration runner
- src/db/index.ts: db connection (postgres-js + drizzle)

Validation:
- Run: npx drizzle-kit generate (must succeed)
- Run: npx drizzle-kit check (must pass)
- Write a test: tests/db/schema.test.ts
  that verifies all tables can be created on a test DB

Commit to branch feature/schema.
Open PR: "feat: database schema and migrations"
Update BUILD_STATE.json: schema.status = "complete"
```

**Success Criteria (CI):**
```yaml
- npx drizzle-kit generate    # generates without error
- npm test -- tests/db/       # schema tests pass
```

---

### Phase 2: XAPI_CLIENT
**Trigger:** schema = complete  
**Depends on:** schema  
**Branch:** `feature/xapi-client`

**Agent Task Prompt:**
```
Read RUNNER_APP_SPEC.md section §9 (xAPI Integration) completely.

Your task: Build the complete 3CX xAPI client.

IMPORTANT — 3CX xAPI naming:
  The 3CX admin UI says "Extensions" and "Departments".
  The xAPI calls them "Users" and "Groups" respectively.
  Use the xAPI names (Users / Groups) in all endpoint paths.

Required deliverables:
- src/xapi/client.ts
  Class: XAPIClient
  Constructor: takes pbxFqdn, validates against whitelist
  Methods:
    getUserByNumber(extensionNumber: string)
      → GET /xapi/v1/Users?$filter=Number eq '{n}'&$expand=Groups&$select=Id,Number,FirstName,LastName,EmailAddress
      → Returns { userId, currentGroupId, emailAddress }

    getGroups()
      → GET /xapi/v1/Groups?$select=Id,Name&$orderby=Name
      → Returns array of { id, name }

    patchUserGroup(userId: number, targetGroupId: number)
      → PATCH /xapi/v1/Users({userId})
      → Body: { "Groups": [{ "GroupId": targetGroupId, "Rights": { "RoleName": "users" } }], "Id": userId }
      → Returns 204; throws PBX_UNAVAILABLE on failure

- src/xapi/auth.ts
  Function: getXAPIToken(pbxFqdn: string)
  - Checks pbx_credentials table for cached token
  - If expired or missing: POST to /connect/token
  - Caches new token with 5-minute buffer
  - Encrypts stored token (use AES-256-GCM with ENCRYPTION_KEY env var)

- src/utils/encrypt.ts
  encrypt(text: string): string
  decrypt(text: string): string

- tests/xapi/client.test.ts
  - Mock all HTTP calls with nock
  - Test: successful user lookup by extension number
  - Test: successful group list
  - Test: successful PATCH → 204 → no error thrown
  - Test: token refresh when expired
  - Test: retry on 503 (3 attempts, exponential backoff 1s/2s/4s)
  - Test: throw PBX_UNAVAILABLE after 3 failures
  - Test: non-whitelisted FQDN rejected before any HTTP call

Commit to branch feature/xapi-client.
Open PR: "feat: 3CX xAPI client with OAuth and retry logic"
Update BUILD_STATE.json: xapi_client.status = "complete"
```

**Success Criteria (CI):**
```yaml
- npm test -- tests/xapi/    # all xAPI tests pass
- npm run build              # still compiles clean
```

---

### Phase 3: AUTH
**Trigger:** xapi_client = complete  
**Depends on:** xapi_client  
**Branch:** `feature/auth`

**Agent Task Prompt:**
```
Read RUNNER_APP_SPEC.md sections §7 and §8 completely.

Your task: Implement Microsoft SSO validation and Entra group check.

Required deliverables:
- src/middleware/authenticate.ts
  validateMicrosoftToken(idToken: string): Promise<TokenPayload>
  Uses jwks-rsa + jsonwebtoken
  Validates: aud, iss, exp
  Returns: { email, name, tid, oid }

- src/entra/groupCheck.ts
  checkEntraGroup(email: string, groupId: string): Promise<boolean>
  Uses Microsoft Graph API
  Caches result for 5 minutes (in-memory Map with TTL)
  Gets Graph token via client credentials (separate from xAPI token)

- src/entra/graphAuth.ts
  getGraphToken(): Promise<string>
  Caches Graph access token until 5 min before expiry

- src/middleware/session.ts
  createSessionToken(payload: RunnerSession): string
  validateSessionToken(token: string): RunnerSession
  Uses JWT_SECRET, expires in JWT_EXPIRES_IN

- tests/auth/
  - Test: valid Microsoft token validates correctly
  - Test: expired token throws TOKEN_EXPIRED
  - Test: wrong audience throws error
  - Test: Entra group check returns true for member
  - Test: Entra group check returns false for non-member
  - Test: group check result is cached
  All Microsoft/Graph calls mocked with nock.

Commit to branch feature/auth.
Open PR: "feat: Microsoft SSO validation and Entra group check"
Update BUILD_STATE.json: auth.status = "complete"
```

**Success Criteria (CI):**
```yaml
- npm test -- tests/auth/    # all auth tests pass
- npm run build              # compiles clean
```

---

### Phase 4: ROUTES
**Trigger:** auth = complete  
**Depends on:** schema, xapi_client, auth  
**Branch:** `feature/routes`

**Agent Task Prompt:**
```
Read RUNNER_APP_SPEC.md section §5 completely.
All existing src/ files are implemented. Use them.

Your task: Implement all four API route handlers.

Required deliverables:

- src/routes/auth.ts → POST /runner/auth
  Implements resolveRunnerContext() exactly as specified in §5
  Returns { mode: 'direct', runner, sessionToken } or { mode: 'select', options }
  All error codes from §13 must be thrown correctly

- src/routes/switch.ts → POST /runner/switch  
  Requires: validateSessionToken middleware
  Validates targetDeptId is in runner.allowedDeptIds
  Calls xapi.patchUserGroup(userId, targetGroupId)
  Returns previous + current dept (group)
  Writes to audit_log (success or failure)

- src/routes/departments.ts → GET /runner/departments
  Requires: validateSessionToken middleware
  Calls xapi.getUserByNumber() to get currentGroupId
  Returns currentDept + allowedDepts (filtered to runner.allowedDeptIds)

- src/routes/health.ts → GET /health
  Returns { status, version, db, uptime }
  Checks DB connectivity with 1s timeout

- src/index.ts (update)
  Register all routes
  Register rate limiter (§5 rate limiting spec)
  Register Sentry error handler

- tests/routes/ (one file per route)
  Every success path tested
  Every error code from §13 tested
  DB mocked with jest mock
  xAPI mocked with nock

Commit to branch feature/routes.
Open PR: "feat: all API route handlers"
Update BUILD_STATE.json: routes.status = "complete"
```

**Success Criteria (CI):**
```yaml
- npm test -- tests/routes/   # all route tests pass
- npm run build               # compiles clean
- curl /health                # returns 200 in Docker
```

---

### Phase 5: AUDIT
**Trigger:** routes = complete  
**Depends on:** routes  
**Branch:** `feature/audit`

**Agent Task Prompt:**
```
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
```

**Success Criteria (CI):**
```yaml
- npm test -- tests/audit/    # audit tests pass
- npm test                    # full suite still green
```

---

### Phase 6: TESTS
**Trigger:** audit = complete  
**Depends on:** audit  
**Branch:** `feature/integration-tests`

**Agent Task Prompt:**
```
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
```

**Success Criteria (CI):**
```yaml
- npm test                    # all unit tests pass
- npm run test:integration    # all integration tests pass
- Coverage report: > 80%
```

---

### Phase 7: HARDENING
**Trigger:** tests = complete  
**Depends on:** tests  
**Branch:** `feature/hardening`

**Agent Task Prompt:**
```
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
```

**Success Criteria (CI):**
```yaml
- npm test                    # full suite still green
- npm run test:security       # security tests pass
- npm run build               # compiles clean
```

---

### Phase 8: INTEGRATION (Final)
**Trigger:** hardening = complete  
**Depends on:** hardening  
**Branch:** `feature/final-integration`

**Agent Task Prompt:**
```
Read RUNNER_APP_SPEC.md completely.
Read all files in src/.
Read all files in tests/.

Your task: Final integration — close every gap between spec and implementation.

Steps:
1. Run npm test — fix any failing tests
2. Run npm run build — fix any type errors
3. Compare every endpoint in §5 against implementation:
   - Request shapes match exactly
   - Response shapes match exactly  
   - All error codes from §13 thrown correctly
4. Verify all audit log fields written (§14)
5. Verify all security headers present (§15)
6. Verify Dockerfile: production build works, runs as non-root user
7. Verify /health returns all required fields
8. Write DEPLOYMENT.md:
   - Coolify setup steps
   - Environment variable checklist
   - First-run migration command
   - Smoke test checklist
9. Update README.md with final accurate setup instructions

Commit to feature/final-integration.
Open PR: "feat: final integration and deployment documentation"
Update BUILD_STATE.json: integration.status = "complete", current_phase = "COMPLETE"
```

**Success Criteria (CI):**
```yaml
- npm test                     # 100% tests passing
- npm run test:integration     # integration tests passing  
- npm run build                # clean build
- docker build . && docker run # container starts, /health returns 200
- Coverage: > 85%
```

---

## GitHub Actions Workflows

### Master Orchestrator

```yaml
# .github/workflows/orchestrate.yml
name: Autonomous Build Orchestrator

on:
  push:
    branches: [main]
    paths: ['BUILD_STATE.json']
  workflow_dispatch:   # Manual trigger for bootstrap

jobs:
  orchestrate:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write

    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_PAT }}
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Claude Code CLI
        run: npm install -g @anthropic-ai/claude-code

      - name: Read build state
        id: state
        run: |
          PHASE=$(jq -r '.current_phase' BUILD_STATE.json)
          BLOCKED=$(jq -r '.blocked' BUILD_STATE.json)
          echo "phase=$PHASE" >> $GITHUB_OUTPUT
          echo "blocked=$BLOCKED" >> $GITHUB_OUTPUT

      - name: Skip if blocked
        if: steps.state.outputs.blocked == 'true'
        run: |
          echo "Pipeline is blocked. Human intervention required."
          echo "See BLOCKED.md for details."
          exit 0

      - name: Skip if complete
        if: steps.state.outputs.phase == 'COMPLETE'
        run: |
          echo "Build pipeline complete! Nothing to do."
          exit 0

      - name: Determine next phase
        id: next
        run: node .github/scripts/next-phase.js

      - name: Run agent for next phase
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_PAT }}
        run: |
          TASK_FILE=".github/tasks/${{ steps.next.outputs.phase }}.md"
          echo "Running agent for phase: ${{ steps.next.outputs.phase }}"
          
          # Update state to running
          node .github/scripts/update-state.js \
            --phase "${{ steps.next.outputs.phase }}" \
            --status running

          # Run Claude Code sub-agent
          claude \
            --dangerously-skip-permissions \
            --print \
            -p "$(cat $TASK_FILE)" \
          || {
            echo "Agent failed. Recording failure."
            node .github/scripts/handle-failure.js \
              --phase "${{ steps.next.outputs.phase }}"
            exit 1
          }

      - name: Commit state update
        run: |
          git config user.email "orchestrator@runner-app"
          git config user.name "Runner Orchestrator"
          git add BUILD_STATE.json
          git diff --staged --quiet || \
            git commit -m "chore: update build state [${{ steps.next.outputs.phase }}]"
          git push
```

---

### CI Validation (runs on every PR)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: runner_test
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      - run: npm ci

      - name: Type check
        run: npm run build

      - name: Lint
        run: npm run lint

      - name: Unit tests
        run: npm test -- --coverage
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/runner_test

      - name: Integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/runner_test

      - name: Docker build
        run: docker build . -t runner-api-test

      - name: Coverage gate
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 80% threshold"
            exit 1
          fi

  auto-merge:
    needs: test
    runs-on: ubuntu-latest
    if: github.actor == 'Runner Orchestrator'
    steps:
      - name: Auto-merge agent PR
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_PAT }}
        run: gh pr merge --auto --squash "${{ github.event.pull_request.number }}"
```

---

### Auto-Deploy on Merge

```yaml
# .github/workflows/deploy.yml
name: Deploy to Coolify

on:
  push:
    branches: [main]
    paths-ignore: ['BUILD_STATE.json', 'BLOCKED.md', 'DEPLOYMENT.md']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Coolify webhook
        run: |
          curl -sf -X POST "${{ secrets.COOLIFY_WEBHOOK }}" \
            -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}" \
        || echo "Deploy webhook failed — check Coolify"
```

---

### Nightly Health Check

```yaml
# .github/workflows/nightly.yml
name: Nightly Pipeline Health

on:
  schedule:
    - cron: '0 6 * * *'    # 06:00 UTC daily

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Check pipeline progress
        id: check
        run: |
          PHASE=$(jq -r '.current_phase' BUILD_STATE.json)
          BLOCKED=$(jq -r '.blocked' BUILD_STATE.json)
          echo "Current phase: $PHASE"
          echo "Blocked: $BLOCKED"
          echo "phase=$PHASE" >> $GITHUB_OUTPUT
          echo "blocked=$BLOCKED" >> $GITHUB_OUTPUT

      - name: Notify if blocked
        if: steps.check.outputs.blocked == 'true'
        run: |
          curl -X POST "${{ secrets.SLACK_WEBHOOK }}" \
            -H 'Content-type: application/json' \
            --data "{
              \"text\": \"🚨 Runner App build pipeline is BLOCKED.\\nPhase: $(jq -r '.current_phase' BUILD_STATE.json)\\nReason: $(jq -r '.blocked_reason' BUILD_STATE.json)\\nSee BLOCKED.md in the repo.\"
            }"

      - name: Notify progress
        if: steps.check.outputs.blocked == 'false' && steps.check.outputs.phase != 'COMPLETE'
        run: |
          curl -X POST "${{ secrets.SLACK_WEBHOOK }}" \
            -H 'Content-type: application/json' \
            --data "{
              \"text\": \"🤖 Runner App build in progress.\\nCurrent phase: $(jq -r '.current_phase' BUILD_STATE.json)\"
            }"
```

---

## Helper Scripts

### `.github/scripts/next-phase.js`

```javascript
// Reads BUILD_STATE.json, outputs the next phase to run
const fs = require('fs');
const state = JSON.parse(fs.readFileSync('BUILD_STATE.json', 'utf8'));

const PHASE_ORDER = [
  'scaffold', 'schema', 'xapi_client', 'auth',
  'routes', 'audit', 'tests', 'hardening', 'integration'
];

// Find first pending phase
const next = PHASE_ORDER.find(p => state.phases[p].status === 'pending');

if (!next) {
  console.log('All phases complete');
  process.exit(0);
}

// Check dependencies are met
const DEPENDENCIES = {
  scaffold:    [],
  schema:      ['scaffold'],
  xapi_client: ['schema'],
  auth:        ['xapi_client'],
  routes:      ['auth'],
  audit:       ['routes'],
  tests:       ['audit'],
  hardening:   ['tests'],
  integration: ['hardening'],
};

const deps = DEPENDENCIES[next];
const allMet = deps.every(d => state.phases[d].status === 'complete');

if (!allMet) {
  const unmet = deps.filter(d => state.phases[d].status !== 'complete');
  console.error(`Dependencies not met for ${next}: ${unmet.join(', ')}`);
  process.exit(1);
}

// Output for GitHub Actions
const core = require('@actions/core');
core.setOutput('phase', next);
console.log(`Next phase: ${next}`);
```

### `.github/scripts/handle-failure.js`

```javascript
// Records failure, increments attempts, blocks after 3 failures
const fs = require('fs');
const args = require('minimist')(process.argv.slice(2));
const phase = args.phase;

const state = JSON.parse(fs.readFileSync('BUILD_STATE.json', 'utf8'));
state.phases[phase].attempts++;
state.phases[phase].status = 'failed';
state.last_error = `Phase ${phase} failed at ${new Date().toISOString()}`;

if (state.phases[phase].attempts >= 3) {
  state.blocked = true;
  state.blocked_reason = `Phase ${phase} failed 3 times. Human intervention required.`;
  state.phases[phase].status = 'blocked';

  // Write BLOCKED.md with instructions
  const blocked = `# Pipeline Blocked

## Phase: ${phase}
## Failed: 3 times
## Time: ${new Date().toISOString()}

## What happened
The autonomous build agent failed to complete phase \`${phase}\` after 3 attempts.

## What to do

1. Check the GitHub Actions logs for the last 3 runs
2. Review the failing phase task in \`.github/tasks/${phase}.md\`
3. Make any necessary fixes manually or update the task prompt
4. Reset the phase: \`node .github/scripts/reset-phase.js --phase ${phase}\`
5. Push to main to restart the pipeline

## Last error
\`\`\`
${state.last_error}
\`\`\`
`;
  fs.writeFileSync('BLOCKED.md', blocked);
}

fs.writeFileSync('BUILD_STATE.json', JSON.stringify(state, null, 2));
```

---

## Secrets Required

Set these in GitHub → Settings → Secrets and variables → Actions:

```
ANTHROPIC_API_KEY        Your Anthropic API key (for Claude Code CLI)
GITHUB_PAT               Personal access token (repo + workflow scope)
                         Needed because GITHUB_TOKEN can't trigger workflows
COOLIFY_WEBHOOK          Coolify deploy webhook URL for runner-api
COOLIFY_WEBHOOK_PWA      Coolify deploy webhook URL for runner-pwa  
COOLIFY_TOKEN            Coolify API token
SLACK_WEBHOOK            Slack incoming webhook URL (for notifications)
                         Optional but recommended for 24/7 visibility
```

---

## Monitoring Dashboard

Once deployed, Sentry + this pipeline gives you full 24/7 visibility:

```
GitHub Actions tab    →  Live pipeline progress, logs per phase
Sentry dashboard      →  Runtime errors, performance
Coolify dashboard     →  Deploy history, container health
Slack notifications   →  Nightly summary + blocked alerts
```

You can watch the entire build happen from your phone.

---

## What Claude Does vs What You Do

```
┌────────────────────────────────────────┬───────┬───────┐
│ Task                                   │ You   │ Claude│
├────────────────────────────────────────┼───────┼───────┤
│ Hetzner instance provisioning          │       │  ✅   │
│ Coolify bootstrap                      │       │  ✅   │
│ GitHub repos + secrets setup           │       │  ✅   │
│ Azure App Registration                 │       │  ✅   │
│ Entra security group setup             │       │  ✅   │
│ Commit seed files to repos             │       │  ✅   │
│ ─────────────────────────────          │       │  ✅   │
│ Writing all application code           │       │  ✅   │
│ Writing all tests                      │       │  ✅   │
│ Opening PRs                            │       │  ✅   │
│ Merging passing PRs                    │       │  ✅   │
│ Triggering deployments                 │       │  ✅   │
│ Updating build state                   │       │  ✅   │
│ Retrying failed phases                 │       │  ✅   │
│ Writing deployment docs                │       │  ✅   │
│ ─────────────────────────────          │       │       │
│ Intune app configuration               │  ✅   │       │
│ Test device enrollment                 │  ✅   │       │
│ Runner pilot (5 users)                 │  ✅   │       │
│ Unblocking if pipeline gets stuck      │  ✅   │       │
└────────────────────────────────────────┴───────┴───────┘
```

**Your total active time: ~30 minutes bootstrap + Intune validation.**  
**Everything in between: autonomous.**

---

*End of ORCHESTRATOR.md*  
*Commit this file + BUILD_STATE.json to start the pipeline.*
