/**
 * switch.spec.ts
 *
 * End-to-end tests for the department switch flow on /departments.
 *
 * Setup strategy
 * ──────────────
 * 1. Auth mock (MSAL + Runner API /runner/auth → direct mode) gets the app
 *    to /departments with runnerProfile, currentDept and allowedDepts in
 *    the Zustand store.
 *
 * 2. After landing on /departments we use setStoreState() to inject
 *    selectedPbxFqdn into the Zustand store.  The /departments page requires
 *    this value to enable the confirm button — the /callback page deliberately
 *    omits setting it (it was designed for the multi-PBX select flow).
 *
 * 3. Runner API /runner/switch is routed via page.route() so each test
 *    controls whether the switch succeeds, returns PBX_UNAVAILABLE, or
 *    RATE_LIMITED.
 */

import { test, expect } from '@playwright/test';
import { setupAuth, setStoreState } from './helpers';

// ---------------------------------------------------------------------------
// Shared setup: navigate to /departments with full state
// ---------------------------------------------------------------------------
async function gotoDeparts(page: Parameters<typeof setupAuth>[0], switchScenario: Parameters<typeof setupAuth>[1]['switchScenario'] = 'switch-success') {
  await setupAuth(page, { authScenario: 'direct', switchScenario });
  await page.goto('/');
  await page.waitForURL('**/departments', { timeout: 15_000 });

  // Inject selectedPbxFqdn so the confirm handler doesn't early-return.
  await setStoreState(page, { selectedPbxFqdn: 'kunde-gmbh.3cx.eu' });
}

// ---------------------------------------------------------------------------
// Test: Happy path — tap card → confirm sheet → confirm → toast → badge update
// ---------------------------------------------------------------------------
test.describe('Happy path department switch', () => {
  test('shows confirm sheet with "Sales → Support" when Support card is tapped', async ({
    page,
  }) => {
    await gotoDeparts(page);

    // Tap the Support dept card
    await page.locator('button[aria-label="Zu Support wechseln"]').click();

    // ConfirmSheet should open (Radix Dialog renders a role=dialog)
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // The from→to row should display "Sales → Support"
    await expect(dialog).toContainText('Sales');
    await expect(dialog).toContainText('→');
    await expect(dialog).toContainText('Support');
  });

  test('shows loading spinner on confirm button while API resolves', async ({ page }) => {
    // Delay the switch API to observe the loading state
    await setupAuth(page, { authScenario: 'direct', switchScenario: 'switch-success' });

    // Override the switch route with a delay
    await page.route('**/runner/switch', async (route) => {
      await page.waitForTimeout(300); // artificial delay
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          previousDept: { id: 3, name: 'Sales' },
          currentDept: { id: 7, name: 'Support' },
          switchedAt: new Date().toISOString(),
        }),
      });
    });

    await page.goto('/');
    await page.waitForURL('**/departments', { timeout: 15_000 });
    await setStoreState(page, { selectedPbxFqdn: 'kunde-gmbh.3cx.eu' });

    await page.locator('button[aria-label="Zu Support wechseln"]').click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Click Confirm
    const confirmBtn = page.locator('button[aria-label^="Zu Support wechseln"]').last();
    // The confirm button inside the dialog
    const dialogConfirmBtn = page
      .locator('[role="dialog"] button[aria-label^="Zu Support"]')
      .or(page.locator('[role="dialog"] button:has-text("Bestätigen")'));
    await dialogConfirmBtn.click();

    // Loading spinner / text should appear on button
    await expect(
      page.locator('[aria-label="Wird gewechselt…"], text=Wird gewechselt'),
    ).toBeVisible({ timeout: 3_000 });
  });

  test('closes sheet and shows success toast after confirm', async ({ page }) => {
    await gotoDeparts(page);

    // Open confirm sheet
    await page.locator('button[aria-label="Zu Support wechseln"]').click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Confirm
    const confirmBtn = page
      .locator('[role="dialog"] button:has-text("Bestätigen")')
      .or(page.locator('[role="dialog"] button[aria-label^="Zu Support"]'));
    await confirmBtn.click();

    // Dialog closes
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 8_000 });

    // Success toast appears
    const toast = page.locator('[data-testid="success-toast"]');
    await expect(toast).toBeVisible({ timeout: 8_000 });
    await expect(toast).toContainText('Switched to Support');
  });

  test('StatusBadge updates to "Support" after successful switch', async ({ page }) => {
    await gotoDeparts(page);

    const badge = page.locator('[role="status"][aria-label^="Aktuell in"]');
    await expect(badge).toContainText('Sales');

    // Open confirm sheet and confirm
    await page.locator('button[aria-label="Zu Support wechseln"]').click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    const confirmBtn = page
      .locator('[role="dialog"] button:has-text("Bestätigen")')
      .or(page.locator('[role="dialog"] button[aria-label^="Zu Support"]'));
    await confirmBtn.click();

    // Wait for dialog to close (switch completed)
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 8_000 });

    // Badge should now show "Support"
    await expect(badge).toContainText('Support', { timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Test: Cancel switch
// ---------------------------------------------------------------------------
test.describe('Cancel department switch', () => {
  test('tapping Cancel closes sheet without making an API call', async ({ page }) => {
    await gotoDeparts(page);

    // Track whether /runner/switch is called
    let switchCalled = false;
    await page.route('**/runner/switch', async (route) => {
      switchCalled = true;
      await route.fallback();
    });

    // Open confirm sheet
    await page.locator('button[aria-label="Zu Support wechseln"]').click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Click Cancel
    await page.locator('button[aria-label="Abbrechen"]').click();

    // Sheet closes
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5_000 });

    // No API call was made
    expect(switchCalled).toBe(false);
  });

  test('StatusBadge remains "Sales" after cancel', async ({ page }) => {
    await gotoDeparts(page);

    await page.locator('button[aria-label="Zu Support wechseln"]').click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    await page.locator('button[aria-label="Abbrechen"]').click();
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5_000 });

    const badge = page.locator('[role="status"][aria-label^="Aktuell in"]');
    await expect(badge).toContainText('Sales');
  });
});

// ---------------------------------------------------------------------------
// Test: PBX unavailable during switch
// ---------------------------------------------------------------------------
test.describe('PBX unavailable error during switch', () => {
  test('navigates to error screen with retry button', async ({ page }) => {
    await gotoDeparts(page, 'switch-pbx-unavailable');

    await page.locator('button[aria-label="Zu Support wechseln"]').click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    const confirmBtn = page
      .locator('[role="dialog"] button:has-text("Bestätigen")')
      .or(page.locator('[role="dialog"] button[aria-label^="Zu Support"]'));
    await confirmBtn.click();

    // App should navigate to /error?code=PBX_UNAVAILABLE
    await page.waitForURL('**/error**', { timeout: 10_000 });

    // PBX_UNAVAILABLE has canRetry: true → retry button is shown
    const retryBtn = page.locator('button[aria-label="Erneut versuchen"]');
    await expect(retryBtn).toBeVisible({ timeout: 5_000 });

    // Error message
    await expect(page.locator('body')).toContainText("Can't reach your phone system");
    await expect(page.locator('body')).toContainText('PBX_UNAVAILABLE');
  });
});

// ---------------------------------------------------------------------------
// Test: Rate limited
// ---------------------------------------------------------------------------
test.describe('Rate limited switch', () => {
  test('navigates to error screen with no retry button', async ({ page }) => {
    await gotoDeparts(page, 'switch-rate-limited');

    await page.locator('button[aria-label="Zu Support wechseln"]').click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    const confirmBtn = page
      .locator('[role="dialog"] button:has-text("Bestätigen")')
      .or(page.locator('[role="dialog"] button[aria-label^="Zu Support"]'));
    await confirmBtn.click();

    // App should navigate to /error?code=RATE_LIMITED
    await page.waitForURL('**/error**', { timeout: 10_000 });

    // RATE_LIMITED has canRetry: false → NO retry button
    const retryBtn = page.locator('button[aria-label="Erneut versuchen"]');
    await expect(retryBtn).not.toBeVisible();

    // Correct error message
    await expect(page.locator('body')).toContainText('Too many switches');
    await expect(page.locator('body')).toContainText('RATE_LIMITED');
  });
});
