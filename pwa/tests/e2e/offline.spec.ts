/**
 * offline.spec.ts
 *
 * Tests for offline / no-network behaviour.
 *
 * Two approaches are used:
 *
 * 1. Direct navigation to /offline  –  the /offline page is a static shell
 *    cached by the service worker and surfaced whenever the network is
 *    unavailable.  Navigating directly lets us verify its content without
 *    needing an actual network failure.
 *
 * 2. Browser offline simulation via Playwright's context.setOffline(true)  –
 *    simulates a true network outage.  When offline, the service worker
 *    should intercept the navigation and serve /offline.
 *    Note: this test only runs if the service worker has been installed from
 *    a previous page load in the same browser context.  In CI the SW might
 *    not be active, so the test is soft-failing unless the SW is detected.
 */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Test: /offline page content
// ---------------------------------------------------------------------------
test.describe('Offline page', () => {
  test('shows "Keine Internetverbindung" and the brand mark when navigated directly', async ({
    page,
  }) => {
    await page.goto('/offline');

    // Brand mark — the circle with "R" is always rendered
    const brandMark = page.locator('div.rounded-full >> text=R');
    await expect(brandMark).toBeVisible();

    // App name
    await expect(page.locator('h1')).toContainText('Runner Hub');

    // Offline indicator text (German as per the component implementation)
    await expect(page.locator('body')).toContainText('Keine Internetverbindung');

    // Retry / reload button is present
    await expect(page.locator('button:has-text("Erneut versuchen")')).toBeVisible();
  });

  test('"No internet connection" message is visible (spec §13 OFFLINE error)', async ({
    page,
  }) => {
    // The spec §13 defines OFFLINE → "No internet connection."
    // The /offline page shows the German equivalent; the /error?code=OFFLINE
    // page (via ErrorScreen) shows both.
    await page.goto('/error?code=OFFLINE');

    await page.waitForSelector('main[role="main"]', { timeout: 10_000 });

    // English message from ErrorScreen.ERROR_MAP
    await expect(page.locator('body')).toContainText('No internet connection');
    // German message
    await expect(page.locator('body')).toContainText('Keine Internetverbindung');
    // Error code label
    await expect(page.locator('body')).toContainText('OFFLINE');

    // OFFLINE has canRetry: true → retry button shown
    await expect(page.locator('button[aria-label="Erneut versuchen"]')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test: Service worker intercepts navigation when offline
// ---------------------------------------------------------------------------
test.describe('Service worker offline interception', () => {
  test('serves offline page when browser goes offline', async ({ page, context }) => {
    // First, visit the app so the service worker has a chance to install.
    // We don't need real auth for this — just a page load.
    await page.goto('/offline'); // lightweight page, no auth required
    await page.waitForLoadState('networkidle');

    // Check if a service worker is registered
    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.length > 0;
    });

    if (!swRegistered) {
      // SW not registered in this test environment (e.g. next-pwa disabled in dev)
      // Log and skip the interception part — the offline page itself still renders.
      test.skip(true, 'Service worker not registered in this environment');
      return;
    }

    // Go offline
    await context.setOffline(true);

    try {
      // Attempt to navigate to a page that requires the server
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 10_000 });

      // The service worker should intercept and show the offline page
      // Either via a direct serve from SW cache or via the /offline route
      const bodyText = await page.locator('body').innerText();
      const showsOffline =
        bodyText.includes('Keine Internetverbindung') ||
        bodyText.includes('No internet connection') ||
        bodyText.includes('Runner Hub');
      expect(showsOffline).toBe(true);
    } finally {
      // Always restore connectivity
      await context.setOffline(false);
    }
  });
});
