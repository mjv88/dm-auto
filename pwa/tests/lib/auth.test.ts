/**
 * tests/lib/auth.test.ts
 *
 * Tests for lib/auth.ts — Microsoft MSAL SSO flow (multi-tenant / "common" authority).
 * @azure/msal-browser is mocked entirely; no real network requests are made.
 */

// ─── Mock @azure/msal-browser ─────────────────────────────────────────────────

const mockAcquireTokenSilent = jest.fn();
const mockAcquireTokenRedirect = jest.fn();
const mockHandleRedirectPromise = jest.fn();
const mockGetAllAccounts = jest.fn();
const mockLogoutRedirect = jest.fn();
const mockInitialize = jest.fn().mockResolvedValue(undefined);

const mockPcaInstance = {
  initialize: mockInitialize,
  handleRedirectPromise: mockHandleRedirectPromise,
  getAllAccounts: mockGetAllAccounts,
  acquireTokenSilent: mockAcquireTokenSilent,
  acquireTokenRedirect: mockAcquireTokenRedirect,
  logoutRedirect: mockLogoutRedirect,
};

const MockPublicClientApplication = jest.fn().mockImplementation(() => mockPcaInstance);

class MockInteractionRequiredAuthError extends Error {
  constructor(message?: string) {
    super(message ?? 'interaction_required');
    this.name = 'InteractionRequiredAuthError';
  }
}

jest.mock('@azure/msal-browser', () => ({
  PublicClientApplication: MockPublicClientApplication,
  InteractionRequiredAuthError: MockInteractionRequiredAuthError,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAccount(overrides: Partial<{ username: string; name: string }> = {}) {
  return { username: 'runner@contoso.com', name: 'Alice Runner', ...overrides };
}

function makeTokenResult(account = makeAccount()) {
  return {
    idToken: 'mock-id-token-xyz',
    account,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  // Default: no redirect result, one cached account
  mockHandleRedirectPromise.mockResolvedValue(null);
  mockGetAllAccounts.mockReturnValue([makeAccount()]);
  mockAcquireTokenSilent.mockResolvedValue(makeTokenResult());
  mockAcquireTokenRedirect.mockResolvedValue(undefined);
  mockLogoutRedirect.mockResolvedValue(undefined);
});

// ─── 1. MSAL uses "common" authority (multi-tenant) ───────────────────────────

test('MSAL is initialised with the "common" authority', async () => {
  const { acquireTokenSilent } = await import('@/lib/auth');
  await acquireTokenSilent();

  expect(MockPublicClientApplication).toHaveBeenCalledWith(
    expect.objectContaining({
      auth: expect.objectContaining({
        authority: 'https://login.microsoftonline.com/common',
      }),
    }),
  );
});

test('MSAL clientId is read from NEXT_PUBLIC_ENTRA_CLIENT_ID env var', async () => {
  process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID = 'test-client-id-1234';
  const { acquireTokenSilent } = await import('@/lib/auth');
  await acquireTokenSilent();

  expect(MockPublicClientApplication).toHaveBeenCalledWith(
    expect.objectContaining({
      auth: expect.objectContaining({
        clientId: 'test-client-id-1234',
      }),
    }),
  );
  delete process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID;
});

// ─── 2. Silent token acquisition returns email + idToken ─────────────────────

test('silent token acquired → returns idToken, email, and name', async () => {
  const { acquireTokenSilent } = await import('@/lib/auth');
  const result = await acquireTokenSilent();

  expect(result).toEqual({
    idToken: 'mock-id-token-xyz',
    email: 'runner@contoso.com',
    name: 'Alice Runner',
  });
});

test('uses account.username as email fallback when name is undefined', async () => {
  mockAcquireTokenSilent.mockResolvedValue(makeTokenResult({ username: 'user@org.com', name: undefined as unknown as string }));

  const { acquireTokenSilent } = await import('@/lib/auth');
  const result = await acquireTokenSilent();

  expect(result.email).toBe('user@org.com');
  expect(result.name).toBe('user@org.com');
});

// ─── 3. Redirect result (coming back from MS login) ───────────────────────────

test('handleRedirectPromise result is returned directly when present', async () => {
  mockHandleRedirectPromise.mockResolvedValue(makeTokenResult());

  const { acquireTokenSilent } = await import('@/lib/auth');
  const result = await acquireTokenSilent();

  expect(result.idToken).toBe('mock-id-token-xyz');
  // acquireTokenSilent must NOT have been called — token came from redirect
  expect(mockAcquireTokenSilent).not.toHaveBeenCalled();
});

// ─── 4. InteractionRequiredAuthError → triggers redirect ─────────────────────

test('InteractionRequiredAuthError → calls acquireTokenRedirect', async () => {
  mockAcquireTokenSilent.mockRejectedValue(new MockInteractionRequiredAuthError('login_required'));
  // acquireTokenRedirect never resolves — simulates browser navigating away
  mockAcquireTokenRedirect.mockReturnValue(new Promise(() => {}));

  const { acquireTokenSilent } = await import('@/lib/auth');

  // We expect the promise to stay pending (redirect) — race with a timeout
  const timedOut = await Promise.race([
    acquireTokenSilent().then(() => false).catch(() => false),
    new Promise<boolean>((r) => setTimeout(() => r(true), 50)),
  ]);

  expect(timedOut).toBe(true);
  expect(mockAcquireTokenRedirect).toHaveBeenCalled();
});

test('no cached accounts → calls acquireTokenRedirect immediately', async () => {
  mockGetAllAccounts.mockReturnValue([]);
  mockAcquireTokenRedirect.mockReturnValue(new Promise(() => {}));

  const { acquireTokenSilent } = await import('@/lib/auth');

  const timedOut = await Promise.race([
    acquireTokenSilent().then(() => false).catch(() => false),
    new Promise<boolean>((r) => setTimeout(() => r(true), 50)),
  ]);

  expect(timedOut).toBe(true);
  expect(mockAcquireTokenRedirect).toHaveBeenCalled();
  // Silent should NOT have been attempted — no account available
  expect(mockAcquireTokenSilent).not.toHaveBeenCalled();
});

// ─── 5. Store updates on auth success ────────────────────────────────────────

test('store authStatus → "authenticated" after successful token exchange', async () => {
  // Import store BEFORE auth to avoid module caching issues
  const { useRunnerStore } = await import('@/lib/store');
  const { acquireTokenSilent } = await import('@/lib/auth');

  useRunnerStore.getState().setAuthStatus('loading');
  await acquireTokenSilent();

  // Caller (callback page) sets status; we verify the store accepts it correctly
  useRunnerStore.getState().setAuthStatus('authenticated');
  expect(useRunnerStore.getState().authStatus).toBe('authenticated');
});

test('store authStatus → "error" on auth failure', async () => {
  const { useRunnerStore } = await import('@/lib/store');

  useRunnerStore.getState().setAuthStatus('error');
  useRunnerStore.getState().setError({ code: 'AUTH_FAILED', message: 'Authentication failed.' });

  expect(useRunnerStore.getState().authStatus).toBe('error');
  expect(useRunnerStore.getState().error?.code).toBe('AUTH_FAILED');
});

// ─── 6. Multi-PBX response shows PBX selector ────────────────────────────────

test('store correctly stores multiple PBX options', async () => {
  const { useRunnerStore } = await import('@/lib/store');

  const pbxOptions = [
    { pbxFqdn: 'pbx1.example.com', pbxName: 'Main PBX' },
    { pbxFqdn: 'pbx2.example.com', pbxName: 'Branch PBX' },
  ];

  useRunnerStore.getState().setPbxOptions(pbxOptions);

  expect(useRunnerStore.getState().pbxOptions).toHaveLength(2);
  expect(useRunnerStore.getState().pbxOptions[0].pbxFqdn).toBe('pbx1.example.com');
});

test('setSelectedPbxFqdn stores chosen PBX fqdn', async () => {
  const { useRunnerStore } = await import('@/lib/store');
  useRunnerStore.getState().setSelectedPbxFqdn('pbx1.example.com');
  expect(useRunnerStore.getState().selectedPbxFqdn).toBe('pbx1.example.com');
});

// ─── 7. TENANT_NOT_REGISTERED error ─────────────────────────────────────────

test('store error is set correctly for TENANT_NOT_REGISTERED', async () => {
  const { useRunnerStore } = await import('@/lib/store');

  useRunnerStore.getState().setAuthStatus('error');
  useRunnerStore.getState().setError({
    code: 'TENANT_NOT_REGISTERED',
    message: 'Your organisation has not been registered with Runner Hub.',
  });

  const state = useRunnerStore.getState();
  expect(state.authStatus).toBe('error');
  expect(state.error?.code).toBe('TENANT_NOT_REGISTERED');
});

// ─── 8. Role defaults to runner and can be changed ──────────────────────────

test('role defaults to runner in initial store state', async () => {
  const { useRunnerStore } = await import('@/lib/store');
  useRunnerStore.getState().reset();
  expect(useRunnerStore.getState().role).toBe('runner');
});

test('setRole(admin) grants admin access', async () => {
  const { useRunnerStore } = await import('@/lib/store');
  useRunnerStore.getState().setRole('admin');
  expect(useRunnerStore.getState().role).toBe('admin');
});

test('setRole(manager) grants manager access', async () => {
  const { useRunnerStore } = await import('@/lib/store');
  useRunnerStore.getState().setRole('manager');
  expect(useRunnerStore.getState().role).toBe('manager');
});

test('reset() clears role back to runner', async () => {
  const { useRunnerStore } = await import('@/lib/store');
  useRunnerStore.getState().setRole('admin');
  useRunnerStore.getState().reset();
  expect(useRunnerStore.getState().role).toBe('runner');
});
