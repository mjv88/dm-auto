# ORCHESTRATOR_PWA.md
## 3CX Runner PWA — Autonomous 24/7 Build Pipeline
**Version:** 1.0.0  
**Repo:** tcx-runner-pwa  
**Runs in parallel with:** ORCHESTRATOR_API.md  
**Human input required:** Zero after bootstrap  

---

## BUILD_STATE.json — Initial State

Commit this to `tcx-runner-pwa` root to start the pipeline.

```json
{
  "pipeline": "tcx-runner-pwa",
  "version": "1.0.0",
  "started_at": null,
  "completed_at": null,
  "current_phase": "PENDING",
  "phases": {
    "scaffold":    { "status": "pending", "attempts": 0, "completed_at": null, "pr_url": null },
    "auth":        { "status": "pending", "attempts": 0, "completed_at": null, "pr_url": null },
    "pwa_config":  { "status": "pending", "attempts": 0, "completed_at": null, "pr_url": null },
    "ui_core":     { "status": "pending", "attempts": 0, "completed_at": null, "pr_url": null },
    "ui_screens":  { "status": "pending", "attempts": 0, "completed_at": null, "pr_url": null },
    "api_client":  { "status": "pending", "attempts": 0, "completed_at": null, "pr_url": null },
    "tests":       { "status": "pending", "attempts": 0, "completed_at": null, "pr_url": null },
    "hardening":   { "status": "pending", "attempts": 0, "completed_at": null, "pr_url": null },
    "integration": { "status": "pending", "attempts": 0, "completed_at": null, "pr_url": null }
  },
  "blocked": false,
  "blocked_reason": null,
  "last_error": null
}
```

---

## Phase Definitions

### Phase 0: SCAFFOLD
**Depends on:** Nothing  
**Branch:** `feature/scaffold`

**Agent Task Prompt:**
```
Read RUNNER_APP_SPEC.md section §3 and §6 and §17.
Read BUILD_STATE.json.

Your task: Scaffold the complete Next.js PWA project structure.

Create EVERY file and folder from the spec §3 tcx-runner-pwa tree.
Files are stubs with correct imports and TODO comments only.
Do not implement any logic yet.

Required deliverables:
- package.json with these exact dependencies:
    next@14, react@18, react-dom@18,
    @azure/msal-browser@3, 
    next-pwa@5,
    tailwindcss@3, 
    zustand@4,
    @radix-ui/react-dialog,
    class-variance-authority,
    clsx,
    typescript@5,
    @types/react, @types/node,
    jest@29, @testing-library/react, @testing-library/jest-dom,
    @playwright/test

- tsconfig.json (strict mode, paths alias: @/* → src/*)
- next.config.js (stub — next-pwa not wired yet, comes in pwa_config phase)
- tailwind.config.js (mobile-first, custom colors: brand blue #0078D4)
- postcss.config.js
- Dockerfile (multi-stage: node:20-alpine builder → runner)
- docker-compose.yml (local dev)
- .env.example (all vars from §17 PWA section)
- jest.config.js (with @testing-library/jest-dom setup)
- playwright.config.ts (baseURL from env)
- app/layout.tsx (stub — root layout)
- app/page.tsx (stub — redirects to /departments)
- app/(auth)/login/page.tsx (stub)
- app/(auth)/callback/page.tsx (stub)
- app/departments/page.tsx (stub)
- app/select-pbx/page.tsx (stub)
- app/error/page.tsx (stub)
- components/ (all component files as stubs)
- lib/auth.ts (stub)
- lib/api.ts (stub)
- lib/store.ts (stub)
- public/manifest.json (complete — values from §11)
- public/icons/.gitkeep

After creating all files:
- Run: npm install
- Run: npm run build (must succeed — stubs compile clean)
- Commit to feature/scaffold
- Open PR: "feat: project scaffold"
- Update BUILD_STATE.json: scaffold.status = "complete"
```

**CI Success Criteria:**
```yaml
- npm install     # zero errors
- npm run build   # Next.js build succeeds
- npm run lint    # zero errors
- docker build .  # image builds
```

---

### Phase 1: AUTH
**Depends on:** scaffold  
**Branch:** `feature/auth`

**Agent Task Prompt:**
```
Read RUNNER_APP_SPEC.md section §7 (Authentication) completely.
Read lib/auth.ts (currently a stub).
Read app/(auth)/login/page.tsx and app/(auth)/callback/page.tsx (stubs).

Your task: Implement the complete Microsoft MSAL SSO flow for the PWA.

Required deliverables:

- lib/auth.ts
  Full MSAL PublicClientApplication config
  acquireTokenSilent(): Promise<AuthResult>
    1. Initialize MSAL
    2. Try silent acquisition (accounts[0])
    3. On InteractionRequiredAuthError → redirect to MS login
    4. On success → return { idToken, email, name }
  signOut(): void
  getStoredAccount(): AccountInfo | null

- lib/store.ts
  Zustand store: useRunnerStore
  State:
    authStatus: 'idle' | 'loading' | 'authenticated' | 'error'
    runnerProfile: RunnerProfile | null
    currentDept: Dept | null
    allowedDepts: Dept[]
    pbxOptions: PBXOption[]       ← for multi-PBX selector
    selectedPbxFqdn: string | null
    error: AppError | null
  Actions:
    setAuthStatus, setRunnerProfile, setCurrentDept,
    setAllowedDepts, setPbxOptions, setError, reset

- app/(auth)/login/page.tsx
  "Sign in with Microsoft" button
  On click → acquireTokenSilent()
  Shows loading spinner during auth
  Microsoft branding: logo, blue button (#0078D4)
  Mobile-first layout — centered card

- app/(auth)/callback/page.tsx
  Handles redirect from Microsoft
  Calls acquireTokenSilent() to complete flow
  On success → POST /runner/auth to Runner API
  On failure → /error with appropriate error code

- app/page.tsx
  On load: attempt silent SSO
  If authenticated → redirect to /departments
  If not → redirect to /login
  Shows loading spinner (never blank)

- types/auth.ts
  AuthResult, RunnerProfile, Dept, PBXOption, AppError types

- tests/lib/auth.test.ts
  Mock @azure/msal-browser completely
  Test: silent token acquired → returns email + idToken
  Test: InteractionRequiredAuthError → triggers redirect
  Test: store updates correctly on auth success
  Test: store updates correctly on auth failure

Commit to feature/auth.
Open PR: "feat: Microsoft MSAL SSO authentication flow"
Update BUILD_STATE.json: auth.status = "complete"
```

**CI Success Criteria:**
```yaml
- npm test -- lib/auth    # auth tests pass
- npm run build           # still builds clean
```

---

### Phase 2: PWA_CONFIG
**Depends on:** auth  
**Branch:** `feature/pwa-config`

**Agent Task Prompt:**
```
Read RUNNER_APP_SPEC.md sections §6 and §11 (PWA + Intune requirements).
Read public/manifest.json (already created in scaffold).
Read next.config.js (currently a stub).

Your task: Full PWA configuration — manifest, service worker, Next.js setup.

Required deliverables:

- next.config.js (replace stub)
  next-pwa fully configured:
    dest: 'public'
    disable in development
    register: true, skipWaiting: true
    runtimeCaching:
      - API calls (NetworkFirst, 5min cache)
      - Static assets (CacheFirst, 30 days)
  output: 'standalone'
  All NEXT_PUBLIC env vars exposed

- public/manifest.json (update with all required fields)
  name: "Runner Hub"
  short_name: "Runner"
  display: "standalone"
  theme_color: "#0078D4"
  background_color: "#ffffff"
  orientation: "portrait"
  start_url: "/?source=pwa"
  icons: 192, 512, 512-maskable
  scope: "/"
  lang: "de"            ← DACH market

- public/sw-custom.js
  Custom service worker additions:
  - Offline fallback page (shows "No connection" shell)
  - Clear notification on new version available
  - Cache API base URL responses

- app/layout.tsx (update stub)
  Complete HTML metadata for PWA:
    viewport: width=device-width, initial-scale=1, viewport-fit=cover
    theme-color: #0078D4
    apple-mobile-web-app-capable: yes
    apple-mobile-web-app-status-bar-style: default
    manifest link
  Root providers: ZustandProvider
  Inter font (Google Fonts, subset: latin)
  Global styles: safe-area insets for notched phones

- public/icons/
  Generate placeholder icons using canvas (node script):
    icon-192.png (blue circle with "R" — placeholder)
    icon-512.png
    icon-512-maskable.png (with safe zone)
  Script: scripts/generate-icons.js

- app/offline/page.tsx
  Shown by service worker when offline:
  Clean "No internet connection" screen
  Runner Hub branding
  "Try again" button

- tests/pwa/manifest.test.ts
  Validates manifest.json has all required Intune fields
  Validates all icon paths exist
  Validates display: standalone
  Validates start_url set

Commit to feature/pwa-config.
Open PR: "feat: PWA configuration, manifest, service worker"
Update BUILD_STATE.json: pwa_config.status = "complete"
```

**CI Success Criteria:**
```yaml
- npm run build              # builds with service worker
- npm test -- pwa/           # manifest tests pass
- Lighthouse PWA score > 90  # via puppeteer quick check
```

---

### Phase 3: UI_CORE
**Depends on:** pwa_config  
**Branch:** `feature/ui-core`

**Agent Task Prompt:**
```
Read RUNNER_APP_SPEC.md section §6 completely — all UI wireframes.
Read all component stubs in components/.
Read lib/store.ts (implemented).

Your task: Build the core reusable UI components.

Design system:
  Primary blue:   #0078D4 (Microsoft brand)
  Success green:  #107C10
  Error red:      #D83B01
  Background:     #F5F5F5
  Card bg:        #FFFFFF
  Text primary:   #201F1E
  Text secondary: #605E5C
  Border radius:  12px (cards), 8px (buttons)
  Font:           Inter
  Touch target:   minimum 48px height (mobile)
  Shadow:         0 2px 8px rgba(0,0,0,0.08)

Required deliverables:

- components/DeptCard.tsx
  Props: dept, isCurrent, isDisabled, onClick
  Current dept: blue left border, greyed, "Currently here" badge
  Available dept: white card, full opacity, hover/active state
  Disabled: 0.4 opacity, no pointer events
  Height: 64px minimum (touch-friendly)
  Animation: subtle scale on press (transform: scale(0.98))

- components/RunnerHeader.tsx
  Props: displayName, extensionNumber, pbxName, pbxFqdn
  Shows: name (bold), extension + PBX name (secondary text)
  Compact — max 72px height
  Avatar: initials circle (blue background)

- components/StatusBadge.tsx
  Props: deptName, color variant
  "Currently in: Sales" — pill badge
  Variants: active (green), switching (yellow), error (red)

- components/ConfirmSheet.tsx
  Radix Dialog (bottom sheet on mobile)
  Props: fromDept, toDept, onConfirm, onCancel, isLoading
  Shows: "{fromDept} → {toDept}"
  Two buttons: Cancel (ghost) + Confirm (blue, full width)
  Loading state: spinner on Confirm button, both disabled
  Slides up from bottom on mobile (CSS: bottom sheet pattern)

- components/ErrorScreen.tsx
  Props: errorCode, onRetry?
  Maps every error code from §13 to human-readable German + English
  Shows icon per error type (🚫 not-a-runner, 📡 PBX down, ⏱ rate limited)
  Shows retry button only where recovery is possible

- components/LoadingScreen.tsx
  Full-screen loading state
  Runner Hub logo + spinner
  Used during auth and dept switching

- components/ui/ (shared primitives)
  Button.tsx (variants: primary, ghost, destructive)
  Card.tsx (wrapper with shadow + border radius)
  Spinner.tsx (animated, sizes: sm/md/lg)
  Badge.tsx (pill variants)

- tests/components/ (one file per component)
  Render tests for all states
  Interaction tests (click, disabled state)
  Accessibility: role attributes, aria-labels

Commit to feature/ui-core.
Open PR: "feat: core UI component library"
Update BUILD_STATE.json: ui_core.status = "complete"
```

**CI Success Criteria:**
```yaml
- npm test -- components/    # all component tests pass
- npm run build              # builds clean
```

---

### Phase 4: UI_SCREENS
**Depends on:** ui_core  
**Branch:** `feature/ui-screens`

**Agent Task Prompt:**
```
Read RUNNER_APP_SPEC.md section §6 (all screen wireframes) and §13 (error states).
All components from ui_core phase are available. Use them.
Read lib/api.ts (currently a stub — you will call it, not implement it).
Read lib/store.ts (implemented).

Your task: Build all full-page screen components.

Required deliverables:

- app/departments/page.tsx (main screen)
  On mount:
    - GET /runner/departments from store (not API — store already populated by auth)
    - Display RunnerHeader
    - Display StatusBadge with currentDept
    - Display list of DeptCards (current greyed, others tappable)
    - Refresh icon top-right (re-fetches from API)
  On dept card tap:
    - Open ConfirmSheet
  On ConfirmSheet confirm:
    - Set store switching state
    - Call lib/api.ts switchDepartment(targetDeptId)
    - On success: update store, show success toast (2s), close sheet
    - On failure: close sheet, show ErrorScreen with error code
  Pull-to-refresh: supported

- app/select-pbx/page.tsx (multi-PBX selector)
  Only shown when store.pbxOptions.length > 1
  Lists PBX options as cards:
    Card shows: pbxName (bold), pbxFqdn (secondary, truncated)
  On tap: set store.selectedPbxFqdn → call api.auth(fqdn) → to /departments
  Back button: not shown (no going back from here)

- app/error/page.tsx
  Reads error from store or URL param ?code=
  Renders ErrorScreen component
  Retry where applicable

- components/SuccessToast.tsx
  Overlay toast: "✅ Switched to {deptName}"
  Auto-dismisses after 2 seconds
  Green background, white text
  Slides in from top

- app/departments/loading.tsx
  Next.js loading state for departments route
  Shows LoadingScreen component

- tests/screens/
  - departments.test.tsx:
    Renders correctly with 3 allowed depts
    Current dept card is disabled
    Tap on dept opens ConfirmSheet
    Confirm calls switchDepartment
    Success shows toast
    API failure shows error screen
  - select-pbx.test.tsx:
    Renders all PBX options
    Tap sets store and navigates
  All API calls mocked via jest.mock('../../lib/api')

Commit to feature/ui-screens.
Open PR: "feat: all screen components"
Update BUILD_STATE.json: ui_screens.status = "complete"
```

**CI Success Criteria:**
```yaml
- npm test -- screens/    # all screen tests pass
- npm run build           # builds clean
```

---

### Phase 5: API_CLIENT
**Depends on:** ui_screens  
**Branch:** `feature/api-client`

**Agent Task Prompt:**
```
Read RUNNER_APP_SPEC.md section §5 completely — all endpoint shapes.
Read lib/api.ts (currently a stub).
Read lib/store.ts (implemented).
Read lib/auth.ts (implemented — use acquireTokenSilent() for tokens).

Your task: Implement the Runner API client that connects the PWA to the backend.

Base URL: process.env.NEXT_PUBLIC_API_URL

Required deliverables:

- lib/api.ts (replace stub)

  class RunnerAPIClient:

  async auth(pbxFqdn?: string): Promise<AuthResponse>
    1. Get idToken from acquireTokenSilent()
    2. POST /runner/auth { idToken, pbxFqdn }
    3. On mode='direct': store runner profile, navigate to /departments
    4. On mode='select': store pbxOptions, navigate to /select-pbx
    5. On error: store error, navigate to /error

  async getDepartments(): Promise<DeptResponse>
    GET /runner/departments                      ← Runner API endpoint (xAPI calls /Groups internally)
    Header: Authorization: Bearer {sessionToken from store}
    On 401: attempt silent re-auth then retry once
    On error: throw typed AppError

  async switchDepartment(targetDeptId: number): Promise<SwitchResponse>
    POST /runner/switch { targetDeptId }
    Header: Authorization: Bearer {sessionToken from store}
    On 401: attempt silent re-auth then retry once
    On success: update store.currentDept
    On error: throw typed AppError with errorCode

  Session token storage:
    Store in memory (Zustand store only)
    Never in localStorage or sessionStorage
    Lost on page reload → re-auth from MSAL (silent, zero friction)

- lib/errors.ts
  AppError class with code + message
  Maps every API error code from §13 to AppError
  isRetryable(code): boolean

- lib/api.test.ts
  Mock fetch globally
  Test: auth → direct mode → store updated correctly
  Test: auth → select mode → pbxOptions in store
  Test: getDepartments → returns group/dept list
  Test: switchDepartment → updates currentDept in store
  Test: 401 triggers re-auth and retries
  Test: PBX_UNAVAILABLE → AppError with isRetryable=true
  Test: NOT_A_RUNNER → AppError with isRetryable=false

Commit to feature/api-client.
Open PR: "feat: Runner API client"
Update BUILD_STATE.json: api_client.status = "complete"
```

**CI Success Criteria:**
```yaml
- npm test -- lib/api    # all API client tests pass
- npm run build          # builds clean
```

---

### Phase 6: TESTS
**Depends on:** api_client  
**Branch:** `feature/e2e-tests`

**Agent Task Prompt:**
```
Read RUNNER_APP_SPEC.md sections §5, §6, §13 completely.
All application code is implemented. 

Your task: Complete Playwright end-to-end tests covering all user flows.

Required deliverables:

- tests/e2e/auth.spec.ts
  Mock Microsoft MSAL (intercept network)
  Mock Runner API (intercept fetch)
  
  Test: Single PBX runner → SSO → lands on departments screen
    Verify: RunnerHeader shows correct name + extension
    Verify: Current dept shown with correct badge
    Verify: Allowed depts shown as tappable cards
    
  Test: Multi-PBX runner → SSO → lands on PBX selector
    Verify: All PBX options shown
    Tap first option → verify navigates to departments
    
  Test: Not-a-runner → SSO → lands on error screen
    Verify: NOT_A_RUNNER error message shown
    Verify: No retry button (dead end)

- tests/e2e/switch.spec.ts
  Test: Happy path dept switch
    Tap dept card → ConfirmSheet opens
    Verify: shows "Sales → Support"
    Tap Confirm → loading spinner on button
    API resolves → sheet closes → toast shown
    Verify: toast says "✅ Switched to Support"
    Verify: StatusBadge updated to "Support"
    
  Test: Cancel switch
    Tap dept → ConfirmSheet opens → tap Cancel
    Verify: sheet closes, no API call made
    
  Test: PBX unavailable during switch
    API returns PBX_UNAVAILABLE
    Verify: error screen shown with retry button
    
  Test: Rate limited
    API returns RATE_LIMITED
    Verify: correct message, no retry button

- tests/e2e/offline.spec.ts
  Test: Offline state
    Service worker intercepts → offline page shown
    "No internet connection" message visible

- tests/e2e/pwa.spec.ts
  Test: PWA manifest accessible at /manifest.json
  Test: Service worker registers successfully
  Test: App renders in standalone display mode
  Test: No horizontal scroll on 375px viewport

- playwright.config.ts (update)
  projects:
    - Mobile Chrome (Pixel 5: 393x851)
    - Mobile Chrome (Galaxy S21: 360x800)
    - Desktop Chrome (fallback)
  baseURL: process.env.PLAYWRIGHT_BASE_URL || http://localhost:3000
  webServer: { command: npm run dev, port: 3000 }

Commit to feature/e2e-tests.
Open PR: "test: complete Playwright E2E test suite"
Update BUILD_STATE.json: tests.status = "complete"
```

**CI Success Criteria:**
```yaml
- npm run test:e2e    # all Playwright tests pass on mobile viewport
- npm test            # unit tests still passing
- npm run build       # clean build
```

---

### Phase 7: HARDENING
**Depends on:** tests  
**Branch:** `feature/hardening`

**Agent Task Prompt:**
```
Read RUNNER_APP_SPEC.md section §15 (Security Requirements) completely.
Read next.config.js, app/layout.tsx, all lib/ files.

Your task: Security hardening, performance, accessibility, edge cases.

Required deliverables:

- next.config.js (update)
  Security headers on all responses:
    Content-Security-Policy:
      default-src 'self'
      script-src 'self' 'unsafe-inline' (required for Next.js)
      connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com
      img-src 'self' data:
    X-Frame-Options: DENY
    X-Content-Type-Options: nosniff
    Referrer-Policy: strict-origin-when-cross-origin
    Permissions-Policy: geolocation=(), microphone=(), camera=()

- app/layout.tsx (update)
  Add viewport meta: viewport-fit=cover (iOS notch support)
  Add apple touch icon links
  Prevent zoom on input focus: font-size minimum 16px on inputs
  Safe area insets for iOS home indicator: pb-safe class

- lib/api.ts (update)
  Add request timeout: 10 seconds (AbortController)
  Add retry on network error: 2 retries, 1s delay
  Add correlation ID header: x-request-id (uuid v4)

- Accessibility audit and fixes:
  All interactive elements have aria-label
  DeptCard: role="button", aria-disabled for current dept
  ConfirmSheet: aria-modal, focus trap when open
  ErrorScreen: role="alert"
  Color contrast: all text passes WCAG AA (4.5:1)
  Touch targets: all >= 44px (Apple HIG minimum)

- Performance:
  app/departments/page.tsx: add React.memo to DeptCard list
  lib/store.ts: add shallow equality checks on selectors
  Images: all icons use next/image with sizes

- Edge cases to handle:
  Extension with zero allowed departments → show "No departments available"
  PBX returns empty department list → show "No departments found"
  Department name longer than 40 chars → truncate with ellipsis
  Network request takes >5s → show "This is taking longer than usual..."
  MSAL popup blocked by browser → show manual login link

- tests/security/
  CSP header present on all routes
  X-Frame-Options present
  No localStorage usage (scan all files)
  Input sanitization on any user-input fields

Commit to feature/hardening.
Open PR: "feat: security headers, accessibility, edge cases"
Update BUILD_STATE.json: hardening.status = "complete"
```

**CI Success Criteria:**
```yaml
- npm run test:e2e      # E2E still passing
- npm test              # unit tests passing
- npm run build         # clean build
- npm run lighthouse    # PWA score > 90, Accessibility > 90
```

---

### Phase 8: INTEGRATION
**Depends on:** hardening  
**Branch:** `feature/final-integration`

**Agent Task Prompt:**
```
Read RUNNER_APP_SPEC.md completely.
Read ALL files in the repo.

Your task: Final integration pass — verify spec compliance, fill gaps, ship docs.

Steps:
1. Run npm run build — fix any errors
2. Run npm test — fix any failing tests
3. Run npm run test:e2e — fix any failing E2E tests
4. Verify against spec §6 every screen matches wireframes:
   - departments screen: header, status badge, dept cards, refresh
   - select-pbx screen: PBX list with fqdn
   - error screen: correct message per error code
   - login screen: MS button, loading state
5. Verify manifest.json has all Intune-required fields (§11)
6. Verify all env vars in .env.example match next.config.js usage
7. Verify Dockerfile: multi-stage, runs as non-root, health check
8. Verify no console.log in production code (use proper logger)
9. Verify no localStorage/sessionStorage usage anywhere

Write DEPLOYMENT.md:
  Prerequisites checklist
  Environment variables (all vars, what each does)
  Coolify deployment steps (exact)
  First deploy verification checklist:
    - App loads on mobile
    - MS SSO works
    - Dept list loads from API
    - Switch completes successfully
    - PWA installs to home screen
  Intune configuration steps (from §11)
  Troubleshooting common issues

Write CHANGELOG.md:
  ## [1.0.0] — Initial Release
  List all features implemented

Update README.md:
  What this app does (2 sentences)
  Tech stack
  Local development setup (5 steps)
  Link to DEPLOYMENT.md
  Link to RUNNER_APP_SPEC.md

Commit to feature/final-integration.
Open PR: "feat: final integration and deployment documentation"
Update BUILD_STATE.json:
  integration.status = "complete"
  current_phase = "COMPLETE"
  completed_at = new Date().toISOString()
```

**CI Success Criteria:**
```yaml
- npm test               # 100% passing
- npm run test:e2e       # all passing on mobile viewport
- npm run build          # clean
- docker build .         # image builds, container starts
- Lighthouse PWA > 90    # verified
```

---

## GitHub Actions Workflows

### `.github/workflows/orchestrate.yml`

```yaml
name: Autonomous PWA Build Orchestrator

on:
  push:
    branches: [main]
    paths: ['BUILD_STATE.json']
  workflow_dispatch:

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
        with: { node-version: '20' }

      - name: Install Claude Code CLI
        run: npm install -g @anthropic-ai/claude-code

      - name: Read build state
        id: state
        run: |
          PHASE=$(jq -r '.current_phase' BUILD_STATE.json)
          BLOCKED=$(jq -r '.blocked' BUILD_STATE.json)
          echo "phase=$PHASE" >> $GITHUB_OUTPUT
          echo "blocked=$BLOCKED" >> $GITHUB_OUTPUT

      - name: Skip if blocked or complete
        if: |
          steps.state.outputs.blocked == 'true' ||
          steps.state.outputs.phase == 'COMPLETE'
        run: echo "Pipeline ${{ steps.state.outputs.phase }}. Exiting." && exit 0

      - name: Determine next phase
        id: next
        run: node .github/scripts/next-phase.js

      - name: Run Claude Code sub-agent
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_PAT }}
        run: |
          node .github/scripts/update-state.js \
            --phase "${{ steps.next.outputs.phase }}" --status running
          
          claude \
            --dangerously-skip-permissions \
            --print \
            -p "$(cat .github/tasks/${{ steps.next.outputs.phase }}.md)" \
          || node .github/scripts/handle-failure.js \
               --phase "${{ steps.next.outputs.phase }}"

      - name: Commit and push state
        run: |
          git config user.email "orchestrator@runner-pwa"
          git config user.name "PWA Orchestrator"
          git add BUILD_STATE.json BLOCKED.md 2>/dev/null || true
          git diff --staged --quiet || \
            git commit -m "chore: build state [${{ steps.next.outputs.phase }}]"
          git push
```

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      - run: npm ci
      - run: npm run build
      - run: npm run lint
      - run: npm test -- --coverage

      - name: Install Playwright
        run: npx playwright install chromium

      - name: E2E tests (mobile viewport)
        run: npm run test:e2e
        env:
          PLAYWRIGHT_BASE_URL: http://localhost:3000

      - name: Docker build
        run: docker build . -t runner-pwa-test

  auto-merge:
    needs: test
    runs-on: ubuntu-latest
    if: github.actor == 'PWA Orchestrator'
    steps:
      - name: Auto-merge
        env: { GITHUB_TOKEN: "${{ secrets.GITHUB_PAT }}" }
        run: gh pr merge --auto --squash "${{ github.event.pull_request.number }}"
```

### `.github/scripts/next-phase.js`

```javascript
const fs = require('fs');
const core = require('@actions/core');

const state = JSON.parse(fs.readFileSync('BUILD_STATE.json', 'utf8'));

const PHASE_ORDER = [
  'scaffold', 'auth', 'pwa_config', 'ui_core',
  'ui_screens', 'api_client', 'tests', 'hardening', 'integration'
];

const DEPENDENCIES = {
  scaffold:    [],
  auth:        ['scaffold'],
  pwa_config:  ['auth'],
  ui_core:     ['pwa_config'],
  ui_screens:  ['ui_core'],
  api_client:  ['ui_screens'],
  tests:       ['api_client'],
  hardening:   ['tests'],
  integration: ['hardening'],
};

const next = PHASE_ORDER.find(p => state.phases[p].status === 'pending');
if (!next) { console.log('All phases complete'); process.exit(0); }

const unmet = DEPENDENCIES[next].filter(d => state.phases[d].status !== 'complete');
if (unmet.length) {
  console.error(`Unmet dependencies for ${next}: ${unmet.join(', ')}`);
  process.exit(1);
}

core.setOutput('phase', next);
console.log(`Next phase: ${next}`);
```

---

*End of ORCHESTRATOR_PWA.md*
