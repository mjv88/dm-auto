/**
 * auth.spec.ts
 *
 * End-to-end tests for the Microsoft SSO → Runner API authentication flow.
 *
 * Mock strategy
 * ─────────────
 * • MSAL (intercept network): page.route() traps all *.microsoftonline.com
 *   requests (discovery doc, token endpoint) and returns fake responses so
 *   the browser never leaves the app.  sessionStorage is pre-seeded with an
 *   MSAL v3 cache entry so getAllAccounts() returns a fake account and
 *   acquireTokenSilent() resolves from cache without a network round-trip.
 *
 * • Runner API (intercept fetch): page.route() traps all /runner/* calls and
 *   returns scenario-specific JSON fixtures.
 *
 * Test flow
 * ─────────
 * Each test navigates to "/" (the root page), which triggers:
 *   1. acquireTokenSilent()  →  resolves with fake id_token  (MSAL mock)
 *   2. router.replace("/callback")
 *   3. CallbackPage calls POST /runner/auth  →  returns mock fixture
 *   4. App routes to /departments  |  /select-pbx  |  /error
 */

import { test, expect } from '@playwright/test';
import { setupAuth, setStoreState } from './helpers';

// ---------------------------------------------------------------------------
// Test: Single-PBX runner → SSO → departments screen
// ---------------------------------------------------------------------------
test.describe('Single-PBX runner SSO', () => {
  test('lands on /departments with correct header, badge, and dept cards', async ({ page }) => {
    await setupAuth(page, { authScenario: 'direct' });

    await page.goto('/');

    // Wait for auth flow to complete and land on /departments
    await page.waitForURL('**/departments', { timeout: 15_000 });

    // ── RunnerHeader ────────────────────────────────────────────────────────
    const header = page.locator('header[aria-label="Runner-Profil"]');
    await expect(header).toBeVisible();

    // Name
    const nameEl = header.locator('p.font-bold');
    await expect(nameEl).toContainText('Maria K.');

    // Extension line: "Ext. 101 · <pbxName>"
    const extEl = header.locator('p.text-xs');
    await expect(extEl).toContainText('Ext. 101');
    await expect(extEl).toContainText('kunde-gmbh.3cx.eu');

    // ── StatusBadge ─────────────────────────────────────────────────────────
    // The mock sets currentDept to Sales
    const statusBadge = page.locator('[role="status"][aria-label^="Aktuell in"]');
    await expect(statusBadge).toBeVisible();
    await expect(statusBadge).toContainText('Sales');

    // ── Allowed department cards ─────────────────────────────────────────────
    // "Sales" is the current dept → rendered as disabled (aria-current=true)
    const salesCard = page.locator('button[aria-current="true"]');
    await expect(salesCard).toBeVisible();
    await expect(salesCard).toContainText('Sales');
    await expect(salesCard).toBeDisabled();

    // "Support" and "Reception" are tappable (not current)
    const supportCard = page.locator('button[aria-label="Zu Support wechseln"]');
    await expect(supportCard).toBeVisible();
    await expect(supportCard).toBeEnabled();

    const receptionCard = page.locator('button[aria-label="Zu Reception wechseln"]');
    await expect(receptionCard).toBeVisible();
    await expect(receptionCard).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Test: Multi-PBX runner → SSO → PBX selector → departments
// ---------------------------------------------------------------------------
test.describe('Multi-PBX runner SSO', () => {
  test('lands on /select-pbx and shows all PBX options', async ({ page }) => {
    await setupAuth(page, { authScenario: 'select' });

    await page.goto('/');

    await page.waitForURL('**/select-pbx', { timeout: 15_000 });

    // Both PBX options should be shown
    const kundePBX = page.locator('button[aria-label="Select Kunde GmbH"]');
    const anderePBX = page.locator('button[aria-label="Select Andere AG"]');

    await expect(kundePBX).toBeVisible();
    await expect(kundePBX).toContainText('Kunde GmbH');
    await expect(kundePBX).toContainText('kunde-gmbh.3cx.eu');

    await expect(anderePBX).toBeVisible();
    await expect(anderePBX).toContainText('Andere AG');
    await expect(anderePBX).toContainText('andere-ag.3cx.eu');
  });

  test('tapping first PBX option navigates to /departments', async ({ page }) => {
    await setupAuth(page, { authScenario: 'select' });

    await page.goto('/');
    await page.waitForURL('**/select-pbx', { timeout: 15_000 });

    // Tap first PBX option
    await page.locator('button[aria-label="Select Kunde GmbH"]').click();

    // Should navigate to /departments after fetching depts
    await page.waitForURL('**/departments', { timeout: 10_000 });

    // Header area should be visible (page loaded successfully)
    await expect(page.locator('header[aria-label="Runner-Profil"]')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test: Not-a-runner → SSO → error screen
// ---------------------------------------------------------------------------
test.describe('Not-a-runner SSO', () => {
  test('lands on error screen with NOT_A_RUNNER message and no retry button', async ({
    page,
  }) => {
    await setupAuth(page, { authScenario: 'not-a-runner' });

    await page.goto('/');

    // The callback page POSTs to /runner/auth → gets 403 NOT_A_RUNNER
    // The callback page shows an inline error OR routes to /error?code=NOT_A_RUNNER.
    // We wait for either outcome.
    await page.waitForFunction(
      () =>
        window.location.pathname.includes('/error') ||
        document.querySelector('[data-testid="callback-error"]') !== null ||
        // The callback page renders an inline error card when res.ok is false
        document.querySelector('h1')?.textContent?.includes('not') ||
        document.querySelector('p')?.textContent?.includes('NOT_A_RUNNER') ||
        document.body.innerText.includes('NOT_A_RUNNER') ||
        document.body.innerText.includes("isn't set up as a Runner"),
      undefined,
      { timeout: 15_000 },
    );

    // Check for the NOT_A_RUNNER error message.
    // The error page shows the English message from ErrorScreen, the callback
    // page shows an inline card — check both possible locations.
    const bodyText = await page.locator('body').innerText();

    const hasErrorMessage =
      bodyText.includes("isn't set up as a Runner") ||
      bodyText.includes('NOT_A_RUNNER') ||
      bodyText.includes('No Access') ||
      bodyText.includes('Kein Zugriff') ||
      bodyText.includes('not authorised') ||
      bodyText.includes('Not authorised');

    expect(hasErrorMessage).toBe(true);

    // There must be NO retry button for NOT_A_RUNNER (dead end per spec §13)
    // The ErrorScreen only renders the retry button when canRetry === true.
    // NOT_A_RUNNER has canRetry: false.
    const retryButton = page.locator('button[aria-label="Erneut versuchen"]');
    await expect(retryButton).not.toBeVisible();
  });

  test('NOT_A_RUNNER error on /error page shows no retry button', async ({ page }) => {
    // Navigate directly to /error?code=NOT_A_RUNNER — simulates state after
    // the callback page sets the error in the store and routes to /error.
    await page.goto('/error?code=NOT_A_RUNNER');

    await page.waitForSelector('main[role="main"]', { timeout: 10_000 });

    // The English message from ErrorScreen.ERROR_MAP
    await expect(page.locator('body')).toContainText("Your account isn't set up as a Runner");

    // The error code is displayed
    await expect(page.locator('body')).toContainText('NOT_A_RUNNER');

    // No retry button (canRetry: false for NOT_A_RUNNER)
    const retryButton = page.locator('button[aria-label="Erneut versuchen"]');
    await expect(retryButton).not.toBeVisible();
  });
});
