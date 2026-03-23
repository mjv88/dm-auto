/**
 * Tests for RunnerAPIClient (lib/api.ts) and AppError (lib/errors.ts).
 *
 * fetch is mocked globally; acquireTokenSilent is mocked via jest.mock.
 * The real Zustand store is used so state assertions reflect actual behaviour.
 */

import { apiClient, getDepartments, switchDepartment } from '@/lib/api';
import { AppError, isRetryable } from '@/lib/errors';
import { useRunnerStore } from '@/lib/store';

// ---------------------------------------------------------------------------
// Global mocks
// ---------------------------------------------------------------------------

global.fetch = jest.fn();
const mockFetch = global.fetch as jest.Mock;

jest.mock('@/lib/auth', () => ({
  acquireTokenSilent: jest.fn().mockResolvedValue({
    idToken: 'test-id-token',
    email: 'runner@example.com',
    name: 'Test Runner',
  }),
}));

// Suppress window.location.replace errors in jsdom
Object.defineProperty(window, 'location', {
  value: { replace: jest.fn() },
  writable: true,
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DIRECT_RESPONSE = {
  mode: 'direct' as const,
  runner: {
    displayName: 'Maria K.',
    extensionNumber: '101',
    pbxFqdn: 'kunde-gmbh.3cx.eu',
    pbxName: 'Kunde GmbH',
    currentDeptId: 3,
    currentDeptName: 'Sales',
    allowedDepts: [
      { id: 3, name: 'Sales' },
      { id: 7, name: 'Support' },
      { id: 12, name: 'Reception' },
    ],
  },
  sessionToken: 'session-jwt-abc',
};

const SELECT_RESPONSE = {
  mode: 'select' as const,
  options: [
    { pbxFqdn: 'kunde-gmbh.3cx.eu', pbxName: 'Kunde GmbH', extensionNumber: '101' },
    { pbxFqdn: 'andere-ag.3cx.eu', pbxName: 'Andere AG', extensionNumber: '205' },
  ],
};

const DEPT_RESPONSE = {
  currentDeptId: 7,
  currentDeptName: 'Support',
  allowedDepts: [
    { id: 3, name: 'Sales' },
    { id: 7, name: 'Support' },
    { id: 12, name: 'Reception' },
  ],
};

const SWITCH_RESPONSE = {
  success: true,
  previousDept: { id: 3, name: 'Sales' },
  currentDept: { id: 7, name: 'Support' },
  switchedAt: '2026-03-12T10:30:00Z',
};

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function errJson(status: number, body: unknown) {
  return { ok: false, status, json: async () => body };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockFetch.mockReset();
  useRunnerStore.getState().reset();
  (window.location.replace as jest.Mock).mockReset();
});

// ---------------------------------------------------------------------------
// auth()
// ---------------------------------------------------------------------------

describe('apiClient.auth()', () => {
  it('direct mode: stores runner profile, session token, and navigates to /departments', async () => {
    mockFetch.mockResolvedValueOnce(okJson(DIRECT_RESPONSE));

    const navigate = jest.fn();
    await apiClient.auth(undefined, navigate);

    const state = useRunnerStore.getState();
    expect(state.sessionToken).toBe('session-jwt-abc');
    expect(state.runnerProfile?.name).toBe('Maria K.');
    expect(state.runnerProfile?.extension).toBe('101');
    expect(state.currentDept?.id).toBe(3);
    expect(state.currentDept?.name).toBe('Sales');
    expect(state.allowedDepts).toHaveLength(3);
    expect(state.authStatus).toBe('authenticated');
    expect(navigate).toHaveBeenCalledWith('/departments');
  });

  it('direct mode with pbxFqdn: passes pbxFqdn in request body', async () => {
    mockFetch.mockResolvedValueOnce(okJson(DIRECT_RESPONSE));

    const navigate = jest.fn();
    await apiClient.auth('kunde-gmbh.3cx.eu', navigate);

    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse(opts.body as string);
    expect(body.pbxFqdn).toBe('kunde-gmbh.3cx.eu');
    expect(body.idToken).toBe('test-id-token');
  });

  it('select mode: stores pbxOptions and navigates to /select-pbx', async () => {
    mockFetch.mockResolvedValueOnce(okJson(SELECT_RESPONSE));

    const navigate = jest.fn();
    await apiClient.auth(undefined, navigate);

    const state = useRunnerStore.getState();
    expect(state.pbxOptions).toHaveLength(2);
    expect(state.pbxOptions[0].pbxFqdn).toBe('kunde-gmbh.3cx.eu');
    expect(state.pbxOptions[1].pbxName).toBe('Andere AG');
    expect(state.authStatus).toBe('authenticated');
    expect(navigate).toHaveBeenCalledWith('/select-pbx');
  });

  it('API error: stores error in store and navigates to /error', async () => {
    mockFetch.mockResolvedValueOnce(errJson(403, { error: 'NOT_A_RUNNER' }));

    const navigate = jest.fn();
    await apiClient.auth(undefined, navigate);

    const state = useRunnerStore.getState();
    expect(state.authStatus).toBe('error');
    expect(state.error?.code).toBe('NOT_A_RUNNER');
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('/error'));
  });
});

// ---------------------------------------------------------------------------
// getDepartments()
// ---------------------------------------------------------------------------

describe('getDepartments()', () => {
  beforeEach(() => {
    useRunnerStore.getState().setSessionToken('valid-token');
  });

  it('returns group/dept list on success', async () => {
    mockFetch.mockResolvedValueOnce(okJson(DEPT_RESPONSE));

    const depts = await getDepartments();
    expect(depts).toHaveLength(3);
    expect(depts[0]).toEqual({ id: 3, name: 'Sales', groupId: 3 });
    expect(depts[1]).toEqual({ id: 7, name: 'Support', groupId: 7 });
  });

  it('sends request with credentials: include (cookie auth)', async () => {
    mockFetch.mockResolvedValueOnce(okJson(DEPT_RESPONSE));

    await getDepartments();

    const [, opts] = mockFetch.mock.calls[0];
    expect((opts as RequestInit).credentials).toBe('include');
  });

  it('401: triggers silent re-auth and retries once, returning dept list', async () => {
    mockFetch
      // 1st call: departments → 401
      .mockResolvedValueOnce(errJson(401, {}))
      // 2nd call: re-auth POST /runner/auth → direct mode with new token
      .mockResolvedValueOnce(okJson({ ...DIRECT_RESPONSE, sessionToken: 'new-token' }))
      // 3rd call: departments retry → success
      .mockResolvedValueOnce(okJson(DEPT_RESPONSE));

    const depts = await getDepartments();

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(depts).toHaveLength(3);
    // Store should have the refreshed token
    expect(useRunnerStore.getState().sessionToken).toBe('new-token');
  });

  it('non-401 error: throws AppError', async () => {
    mockFetch.mockResolvedValueOnce(errJson(503, { error: 'PBX_UNAVAILABLE' }));

    await expect(getDepartments()).rejects.toMatchObject({
      code: 'PBX_UNAVAILABLE',
    });
  });
});

// ---------------------------------------------------------------------------
// switchDepartment()
// ---------------------------------------------------------------------------

describe('switchDepartment()', () => {
  beforeEach(() => {
    useRunnerStore.getState().setSessionToken('valid-token');
  });

  it('updates currentDept in store on success', async () => {
    mockFetch.mockResolvedValueOnce(okJson(SWITCH_RESPONSE));

    await switchDepartment('any-fqdn', 7);

    const state = useRunnerStore.getState();
    expect(state.currentDept?.id).toBe(7);
    expect(state.currentDept?.name).toBe('Support');
  });

  it('sends correct request body with credentials: include (cookie auth)', async () => {
    mockFetch.mockResolvedValueOnce(okJson(SWITCH_RESPONSE));

    await switchDepartment('any-fqdn', 7);

    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.targetDeptId).toBe(7);
    expect((opts as RequestInit).credentials).toBe('include');
  });

  it('401: triggers silent re-auth and retries once', async () => {
    mockFetch
      // 1st call: switch → 401
      .mockResolvedValueOnce(errJson(401, {}))
      // 2nd call: re-auth → new token
      .mockResolvedValueOnce(okJson({ ...DIRECT_RESPONSE, sessionToken: 'refreshed-token' }))
      // 3rd call: switch retry → success
      .mockResolvedValueOnce(okJson(SWITCH_RESPONSE));

    await switchDepartment('any-fqdn', 7);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(useRunnerStore.getState().currentDept?.id).toBe(7);
  });

  it('error response: throws AppError with errorCode', async () => {
    mockFetch.mockResolvedValueOnce(errJson(403, { errorCode: 'DEPT_NOT_ALLOWED' }));

    await expect(switchDepartment('any-fqdn', 99)).rejects.toMatchObject({
      code: 'DEPT_NOT_ALLOWED',
    });
  });
});

// ---------------------------------------------------------------------------
// AppError / isRetryable
// ---------------------------------------------------------------------------

describe('AppError', () => {
  it('PBX_UNAVAILABLE → isRetryable() = true', () => {
    const err = new AppError('PBX_UNAVAILABLE');
    expect(err.isRetryable()).toBe(true);
    expect(err.code).toBe('PBX_UNAVAILABLE');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it('NOT_A_RUNNER → isRetryable() = false', () => {
    const err = new AppError('NOT_A_RUNNER');
    expect(err.isRetryable()).toBe(false);
    expect(err.message).toMatch(/set up as a Runner/i);
  });

  it('RATE_LIMITED → isRetryable() = true', () => {
    expect(new AppError('RATE_LIMITED').isRetryable()).toBe(true);
  });

  it('TOKEN_EXPIRED → isRetryable() = false', () => {
    expect(new AppError('TOKEN_EXPIRED').isRetryable()).toBe(false);
  });

  it('OFFLINE → isRetryable() = true', () => {
    expect(new AppError('OFFLINE').isRetryable()).toBe(true);
  });

  it('AppError.fromCode maps known codes correctly', () => {
    const err = AppError.fromCode('PBX_UNAVAILABLE');
    expect(err.code).toBe('PBX_UNAVAILABLE');
    expect(err.isRetryable()).toBe(true);
  });

  it('AppError.fromCode maps unknown codes to UNKNOWN', () => {
    const err = AppError.fromCode('MADE_UP_CODE');
    expect(err.code).toBe('UNKNOWN');
  });

  it('standalone isRetryable() helper matches instance method', () => {
    expect(isRetryable('PBX_UNAVAILABLE')).toBe(true);
    expect(isRetryable('NOT_A_RUNNER')).toBe(false);
    expect(isRetryable('OFFLINE')).toBe(true);
    expect(isRetryable('XAPI_AUTH_FAILED')).toBe(false);
  });
});
