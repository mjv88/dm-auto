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
