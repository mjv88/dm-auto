/**
 * E2E test helpers for tcx-runner-pwa.
 *
 * Strategy overview
 * ─────────────────
 * 1. MSAL mock  – pre-seed sessionStorage with a well-formed MSAL v3 cache
 *    entry so that PublicClientApplication.getAllAccounts() returns a fake
 *    account and acquireTokenSilent() returns a cached id_token without any
 *    network trip to login.microsoftonline.com.
 *    All requests to *.microsoftonline.com / *.windows.net are also routed via
 *    page.route() so MSAL's discovery fetch gets a valid (fake) response.
 *
 * 2. Runner API mock – page.route() intercepts every /runner/* call and
 *    returns scenario-specific JSON fixtures.
 *
 * 3. Zustand store injection – after auth completes and the app has navigated
 *    to a screen, we use page.evaluate() to walk the webpack module cache and
 *    call useRunnerStore.setState(). This lets switch tests set selectedPbxFqdn
 *    (which the callback page omits).
 */

import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Fake identity constants
// ---------------------------------------------------------------------------
export const FAKE_HOME_ACCOUNT_ID = 'fake-uid.fake-tenantid';
export const FAKE_TENANT_ID = 'fake-tenantid';
export const FAKE_ENV = 'login.windows.net';
// clientId is an empty string in test runs because NEXT_PUBLIC_ENTRA_CLIENT_ID
// is not set in the test environment.
export const FAKE_CLIENT_ID = '';

/**
 * Minimal JWT (header.payload.sig) whose payload MSAL will decode to derive
 * account.username and account.name from the cached idToken.
 *
 * Values are base64url-encoded but NOT cryptographically signed — MSAL does
 * not verify cached tokens client-side.
 *
 * Payload claims:
 *   preferred_username : runner@contoso.com
 *   name               : Maria K.
 *   exp                : year 2286 (never expires in tests)
 *   tid                : fake-tenantid
 *   aud                : "" (matches empty clientId)
 */
export const FAKE_ID_TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJvaWQiOiJmYWtlLW9pZCIsInN1YiI6ImZha2Utc3ViIiwicHJlZmVycmVkX3VzZXJuYW1lIjoicnVubmVyQGNvbnRvc28uY29tIiwibmFtZSI6Ik1hcmlhIEsuIiwiZXhwIjo5OTk5OTk5OTk5LCJpYXQiOjEwMDAwMDAwMDAsImlzcyI6Imh0dHBzOi8vbG9naW4ubWljcm9zb2Z0b25saW5lLmNvbS9mYWtlLXRlbmFudGlkL3YyLjAiLCJ0aWQiOiJmYWtlLXRlbmFudGlkIiwiYXVkIjoiIiwibm9uY2UiOiJmYWtlLW5vbmNlIn0' +
  '.fake-sig-not-validated';

// ---------------------------------------------------------------------------
// MSAL OpenID Connect discovery document (minimal)
// ---------------------------------------------------------------------------
const OIDC_DISCOVERY = {
  issuer: `https://login.microsoftonline.com/${FAKE_TENANT_ID}/v2.0`,
  authorization_endpoint: `https://login.microsoftonline.com/${FAKE_TENANT_ID}/oauth2/v2.0/authorize`,
  token_endpoint: `https://login.microsoftonline.com/${FAKE_TENANT_ID}/oauth2/v2.0/token`,
  jwks_uri: `https://login.microsoftonline.com/${FAKE_TENANT_ID}/discovery/v2.0/keys`,
  response_types_supported: ['code', 'id_token', 'code id_token'],
  subject_types_supported: ['pairwise'],
  id_token_signing_alg_values_supported: ['RS256'],
  scopes_supported: ['openid', 'profile', 'email'],
  end_session_endpoint: `https://login.microsoftonline.com/${FAKE_TENANT_ID}/oauth2/v2.0/logout`,
  claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'name', 'preferred_username', 'tid', 'oid'],
  tenant_region_scope: 'EU',
  cloud_instance_name: 'microsoftonline.com',
  msgraph_host: 'graph.microsoft.com',
};

const JWKS_RESPONSE = {
  keys: [{ kty: 'RSA', use: 'sig', kid: 'fake-kid', n: 'fake-n', e: 'AQAB' }],
};

// ---------------------------------------------------------------------------
// injectMSALCache
// ---------------------------------------------------------------------------
/**
 * Seeds sessionStorage with a well-formed MSAL v3 cache so that
 * PublicClientApplication can find an existing account and return a cached
 * token without any redirect to Microsoft.
 *
 * Must be called via page.addInitScript() so it runs before any JS.
 */
export async function injectMSALCache(page: Page): Promise<void> {
  await page.addInitScript(
    ({
      homeAccountId,
      environment,
      tenantId,
      clientId,
      idToken,
    }) => {
      const farFuture = String(Math.floor(Date.now() / 1000) + 86400 * 365 * 10);
      const now = String(Math.floor(Date.now() / 1000));

      // ── Account entity ────────────────────────────────────────────────────
      const accountKey = `${homeAccountId}-${environment}-${tenantId}`.toLowerCase();
      const accountValue = JSON.stringify({
        homeAccountId,
        environment,
        tenantId,
        username: 'runner@contoso.com',
        localAccountId: 'fake-oid',
        name: 'Maria K.',
        authorityType: 'MSSTS',
        realm: tenantId,
      });
      sessionStorage.setItem(accountKey, accountValue);

      // ── IdToken entity ────────────────────────────────────────────────────
      // Key format: {homeAccountId}-{env}-idtoken-{clientId}-{realm}--
      const idTokenKey =
        `${homeAccountId}-${environment}-idtoken-${clientId}-${tenantId}--`.toLowerCase();
      const idTokenValue = JSON.stringify({
        homeAccountId,
        environment,
        credentialType: 'IdToken',
        clientId,
        secret: idToken,
        realm: tenantId,
      });
      sessionStorage.setItem(idTokenKey, idTokenValue);

      // ── AccessToken entity ────────────────────────────────────────────────
      const scopeTarget = 'email openid profile user.read';
      const accessTokenKey =
        `${homeAccountId}-${environment}-accesstoken-${clientId}-${tenantId}-${scopeTarget}--`.toLowerCase();
      const accessTokenValue = JSON.stringify({
        homeAccountId,
        environment,
        credentialType: 'AccessToken',
        clientId,
        secret: 'fake-access-token',
        realm: tenantId,
        target: scopeTarget,
        expiresOn: farFuture,
        extendedExpiresOn: farFuture,
        cachedAt: now,
        tokenType: 'Bearer',
      });
      sessionStorage.setItem(accessTokenKey, accessTokenValue);

      // ── MSAL meta-index keys ──────────────────────────────────────────────
      // MSAL v3.30+ changed the meta-index key format:
      //   Account keys: "msal.account.keys" (no clientId prefix)
      //   Token keys:   "msal.token.keys.{homeAccountId}" (keyed by account, not tenant)
      // We set all plausible key variations to ensure cache hits.
      sessionStorage.setItem(
        'msal.account.keys',
        JSON.stringify([accountKey]),
      );
      // Token keys indexed by homeAccountId (current MSAL v3.30+)
      sessionStorage.setItem(
        `msal.token.keys.${homeAccountId}`,
        JSON.stringify({
          idToken: [idTokenKey],
          accessToken: [accessTokenKey],
          refreshToken: [],
        }),
      );
      // Token keys indexed by clientId (legacy / fallback)
      sessionStorage.setItem(
        `msal.token.keys.${clientId}`,
        JSON.stringify({
          idToken: [idTokenKey],
          accessToken: [accessTokenKey],
          refreshToken: [],
        }),
      );
      // Token keys indexed by tenantId (another possible lookup)
      sessionStorage.setItem(
        `msal.token.keys.${tenantId}`,
        JSON.stringify({
          idToken: [idTokenKey],
          accessToken: [accessTokenKey],
          refreshToken: [],
        }),
      );
    },
    {
      homeAccountId: FAKE_HOME_ACCOUNT_ID,
      environment: FAKE_ENV,
      tenantId: FAKE_TENANT_ID,
      clientId: FAKE_CLIENT_ID,
      idToken: FAKE_ID_TOKEN,
    },
  );
}

// ---------------------------------------------------------------------------
// mockMSALNetwork
// ---------------------------------------------------------------------------
/**
 * Intercepts all requests to Microsoft identity endpoints so MSAL's
 * initialise() / discovery fetch doesn't hit the real MS servers.
 */
export async function mockMSALNetwork(page: Page): Promise<void> {
  await page.route('https://login.microsoftonline.com/**', async (route) => {
    const url = route.request().url();
    if (url.includes('openid-configuration') || url.includes('discovery')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(OIDC_DISCOVERY),
      });
    } else if (url.includes('/keys')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(JWKS_RESPONSE),
      });
    } else if (url.includes('/token')) {
      // Silent token refresh — return a successful token response
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'fake-access-token',
          id_token: FAKE_ID_TOKEN,
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'openid profile email User.Read',
        }),
      });
    } else {
      // Any other MS request (e.g. authorize redirect) — abort to prevent
      // the browser from navigating away from the test app.
      await route.abort();
    }
  });

  // Microsoft Graph (used by some MSAL flows)
  await page.route('https://graph.microsoft.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

// ---------------------------------------------------------------------------
// Runner API mock fixtures
// ---------------------------------------------------------------------------

export const DIRECT_AUTH_RESPONSE = {
  mode: 'direct',
  runner: {
    id: '101',
    name: 'Maria K.',
    email: 'runner@contoso.com',
    extension: '101',
    pbxFqdn: 'kunde-gmbh.3cx.eu',
    allowedDepts: [
      { id: 3, name: 'Sales', groupId: 3 },
      { id: 7, name: 'Support', groupId: 7 },
      { id: 12, name: 'Reception', groupId: 12 },
    ],
    currentDept: { id: 3, name: 'Sales', groupId: 3 },
  },
  currentDept: { id: 3, name: 'Sales', groupId: 3 },
  allowedDepts: [
    { id: 3, name: 'Sales', groupId: 3 },
    { id: 7, name: 'Support', groupId: 7 },
    { id: 12, name: 'Reception', groupId: 12 },
  ],
};

export const SELECT_AUTH_RESPONSE = {
  mode: 'select',
  runner: {
    id: '101',
    name: 'Maria K.',
    email: 'runner@contoso.com',
    extension: '101',
    pbxFqdn: null,
    allowedDepts: [],
    currentDept: null,
  },
  pbxOptions: [
    { pbx_fqdn: 'kunde-gmbh.3cx.eu', pbx_name: 'Kunde GmbH' },
    { pbx_fqdn: 'andere-ag.3cx.eu', pbx_name: 'Andere AG' },
  ],
};

export const DEPARTMENTS_RESPONSE = {
  currentDeptId: 3,
  currentDeptName: 'Sales',
  allowedDepts: [
    { id: 3, name: 'Sales' },
    { id: 7, name: 'Support' },
    { id: 12, name: 'Reception' },
  ],
};

export const SWITCH_SUCCESS_RESPONSE = {
  success: true,
  previousDept: { id: 3, name: 'Sales' },
  currentDept: { id: 7, name: 'Support' },
  switchedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// mockRunnerAPI
// ---------------------------------------------------------------------------

export type RunnerAPIScenario =
  | 'direct'
  | 'select'
  | 'not-a-runner'
  | 'switch-success'
  | 'switch-pbx-unavailable'
  | 'switch-rate-limited';

/**
 * Registers page.route() handlers for all /runner/* endpoints.
 * `switchScenario` controls the outcome of POST /runner/switch.
 */
export async function mockRunnerAPI(
  page: Page,
  {
    authScenario = 'direct',
    switchScenario = 'switch-success',
  }: {
    authScenario?: 'direct' | 'select' | 'not-a-runner';
    switchScenario?: 'switch-success' | 'switch-pbx-unavailable' | 'switch-rate-limited';
  } = {},
): Promise<void> {
  // POST /runner/auth
  await page.route('**/runner/auth', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    switch (authScenario) {
      case 'not-a-runner':
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'NOT_A_RUNNER' }),
        });
        break;
      case 'select':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(SELECT_AUTH_RESPONSE),
        });
        break;
      case 'direct':
      default:
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(DIRECT_AUTH_RESPONSE),
        });
    }
  });

  // GET /runner/departments
  await page.route('**/runner/departments', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(DEPARTMENTS_RESPONSE),
    });
  });

  // POST /runner/switch
  await page.route('**/runner/switch', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    switch (switchScenario) {
      case 'switch-pbx-unavailable':
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'PBX_UNAVAILABLE' }),
        });
        break;
      case 'switch-rate-limited':
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'RATE_LIMITED' }),
        });
        break;
      case 'switch-success':
      default:
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(SWITCH_SUCCESS_RESPONSE),
        });
    }
  });
}

// ---------------------------------------------------------------------------
// setStoreState
// ---------------------------------------------------------------------------
/**
 * Injects Zustand store state from within the browser context by walking the
 * webpack module cache to find the useRunnerStore export.
 *
 * This is intentionally a test-only utility — it must never be used in
 * production code.
 *
 * We need this because the /callback page does not set selectedPbxFqdn, but
 * the /departments page requires it to enable the switch confirm button.
 */
export async function setStoreState(
  page: Page,
  updates: Record<string, unknown>,
): Promise<boolean> {
  return page.evaluate((u) => {
    // Strategy 1: Classic __webpack_require__ (Next.js pages-router / older builds)
    const req = (window as unknown as Record<string, unknown>).__webpack_require__;
    if (req) {
      const cache =
        (req as unknown as Record<string, unknown>).c as Record<
          string,
          { exports?: Record<string, unknown> }
        > | undefined;
      if (cache) {
        for (const id of Object.keys(cache)) {
          try {
            const mod = cache[id];
            const ex = mod?.exports as Record<string, unknown> | undefined;
            if (ex?.useRunnerStore) {
              const store = ex.useRunnerStore as {
                setState: (p: Record<string, unknown>) => void;
              };
              store.setState(u);
              return true;
            }
          } catch {
            // skip modules that throw on property access
          }
        }
      }
    }

    // Strategy 2: webpackChunk_N_E (Next.js app-router with RSC)
    // Push a synthetic chunk to obtain __webpack_require__ and walk the module cache.
    const chunks = (window as unknown as Record<string, unknown[][]>).webpackChunk_N_E;
    if (!chunks) return false;

    let found = false;
    chunks.push([
      ['__test_set_store__'],
      {},
      ((requireFn: {
        c?: Record<string, { exports?: Record<string, unknown> }>;
      }) => {
        const cache = requireFn.c;
        if (!cache) return;
        for (const id of Object.keys(cache)) {
          try {
            const ex = cache[id]?.exports as Record<string, unknown> | undefined;
            if (ex?.useRunnerStore) {
              const store = ex.useRunnerStore as {
                setState: (p: Record<string, unknown>) => void;
              };
              store.setState(u);
              found = true;
              break;
            }
          } catch {
            // skip modules that throw on property access
          }
        }
      }) as unknown as (() => void),
    ]);
    return found;
  }, updates);
}

// ---------------------------------------------------------------------------
// setupAuth  – one-call helper used by most tests
// ---------------------------------------------------------------------------
/**
 * Injects MSAL cache, registers route mocks, and (after the page has loaded
 * and the auth flow has completed) sets selectedPbxFqdn in the store so the
 * departments page switch confirm button is enabled.
 */
export async function setupAuth(
  page: Page,
  options: {
    authScenario?: 'direct' | 'select' | 'not-a-runner';
    switchScenario?: 'switch-success' | 'switch-pbx-unavailable' | 'switch-rate-limited';
  } = {},
): Promise<void> {
  await injectMSALCache(page);
  await mockMSALNetwork(page);
  await mockRunnerAPI(page, options);
}
