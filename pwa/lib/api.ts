import { acquireTokenSilent } from '@/lib/auth';
import { useRunnerStore } from '@/lib/store';
import { AppError } from '@/lib/errors';
import type { Dept, PBXOption, RunnerProfile } from '@/types/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

const REQUEST_TIMEOUT_MS = 10_000;
const RETRY_COUNT = 2;
const RETRY_DELAY_MS = 1_000;

// ---------------------------------------------------------------------------
// Fetch helpers — timeout, retry, correlation ID
// ---------------------------------------------------------------------------

function generateRequestId(): string {
  // UUID v4 — uses crypto.randomUUID where available, falls back to manual
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  // Inject Bearer token from store (primary auth); credentials: 'include' kept as fallback
  const headers = new Headers(init.headers);
  const token = getState().sessionToken;
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  try {
    const response = await fetch(url, {
      ...init,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  retries = RETRY_COUNT,
): Promise<Response> {
  const requestId = generateRequestId();
  const headers = new Headers(init.headers);
  headers.set('x-request-id', requestId);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, { ...init, headers });
      return response;
    } catch (err) {
      const isNetworkError =
        err instanceof TypeError ||
        (err instanceof DOMException && err.name === 'AbortError');
      if (isNetworkError && attempt < retries) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
  // unreachable but satisfies TS
  throw new AppError('OFFLINE');
}

// ---------------------------------------------------------------------------
// Wire shapes — match §5 endpoint responses exactly
// ---------------------------------------------------------------------------

interface AuthRunnerPayload {
  displayName: string;
  extensionNumber: string;
  pbxFqdn: string;
  pbxName: string;
  currentDeptId: number;
  currentDeptName: string;
  allowedDepts: Array<{ id: number; name: string }>;
}

interface AuthDirectResponse {
  mode: 'direct';
  runner: AuthRunnerPayload;
  sessionToken: string;
}

interface AuthSelectResponse {
  mode: 'select';
  options: Array<{ pbxFqdn: string; pbxName: string; extensionNumber: string }>;
}

export type AuthResponse = AuthDirectResponse | AuthSelectResponse;

export interface DeptResponse {
  currentDeptId: number;
  currentDeptName: string;
  allowedDepts: Array<{ id: number; name: string }>;
  ivrAccess?: boolean;
}

export interface SwitchResponse {
  success: boolean;
  previousDept: { id: number; name: string };
  currentDept: { id: number; name: string };
  switchedAt: string;
}

export interface Department {
  id: number;
  name: string;
  groupId: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getState() {
  return useRunnerStore.getState();
}

async function parseErrorBody(res: Response): Promise<AppError> {
  const body = await res.json().catch(() => ({}));
  const code: string = body?.error ?? body?.errorCode ?? 'UNKNOWN';
  return AppError.fromCode(code);
}

// ---------------------------------------------------------------------------
// RunnerAPIClient
// ---------------------------------------------------------------------------

export class RunnerAPIClient {
  /**
   * Silent re-auth: refreshes the session token using a fresh MSAL id_token.
   * Does NOT navigate — used internally by getDepartments / switchDepartment
   * when a 401 is received.
   */
  private async _silentReAuth(): Promise<void> {
    const store = getState();
    const { idToken } = await acquireTokenSilent();
    const pbxFqdn =
      store.runnerProfile?.pbxFqdn ?? store.selectedPbxFqdn ?? undefined;

    const res = await fetchWithRetry(`${API_BASE}/runner/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, ...(pbxFqdn ? { pbxFqdn } : {}) }),
    });

    if (!res.ok) {
      throw new AppError('TOKEN_EXPIRED');
    }

    const data: AuthResponse = await res.json();
    if (data.mode === 'direct') {
      store.setSessionToken((data as AuthDirectResponse).sessionToken);
    } else {
      // Multi-PBX: can't silently pick a PBX — surface as expired
      throw new AppError('TOKEN_EXPIRED');
    }
  }

  /**
   * Full auth flow. Acquires an MSAL id_token, exchanges it for a Runner API
   * session, populates the store, and navigates to the appropriate screen.
   *
   * @param pbxFqdn   Optional — pre-selects a PBX (supplied via Intune URL param)
   * @param navigate  Navigation callback. Defaults to window.location.replace.
   *                  Pass router.replace from a Next.js component for SPA navigation.
   */
  async auth(
    pbxFqdn?: string,
    navigate: (path: string) => void = (p) => {
      if (typeof window !== 'undefined') window.location.replace(p);
    },
  ): Promise<void> {
    const store = getState();
    store.setAuthStatus('loading');

    try {
      const { idToken } = await acquireTokenSilent();

      const res = await fetchWithRetry(`${API_BASE}/runner/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, ...(pbxFqdn ? { pbxFqdn } : {}) }),
      });

      const data = await res.json() as AuthResponse & { error?: string };

      if (!res.ok) {
        const code = (data as { error?: string }).error ?? 'UNKNOWN';
        store.setError({ code, message: AppError.fromCode(code).message });
        store.setAuthStatus('error');
        navigate(`/error?code=${encodeURIComponent(code)}`);
        return;
      }

      if (data.mode === 'direct') {
        const { runner, sessionToken } = data as AuthDirectResponse;

        const allowedDepts: Dept[] = runner.allowedDepts.map((d) => ({
          id: d.id,
          name: d.name,
          groupId: d.id,
        }));
        const currentDept: Dept = {
          id: runner.currentDeptId,
          name: runner.currentDeptName,
          groupId: runner.currentDeptId,
        };
        const profile: RunnerProfile = {
          id: runner.extensionNumber,
          name: runner.displayName,
          email: '',
          extension: runner.extensionNumber,
          pbxFqdn: runner.pbxFqdn,
          allowedDepts,
          currentDept,
        };

        store.setSessionToken(sessionToken);
        store.setRunnerProfile(profile);
        store.setCurrentDept(currentDept);
        store.setAllowedDepts(allowedDepts);
        store.setSelectedPbxFqdn(runner.pbxFqdn);
        store.setAuthStatus('authenticated');
        navigate('/departments');
      } else {
        const { options } = data as AuthSelectResponse;
        const pbxOptions: PBXOption[] = options.map((o) => ({
          pbxFqdn: o.pbxFqdn,
          pbxName: o.pbxName,
        }));
        store.setPbxOptions(pbxOptions);
        store.setAuthStatus('authenticated');
        navigate('/select-pbx');
      }
    } catch (err) {
      const appErr =
        err instanceof AppError
          ? err
          : new AppError('UNKNOWN', err instanceof Error ? err.message : undefined);
      store.setError({ code: appErr.code, message: appErr.message });
      store.setAuthStatus('error');
      navigate(`/error?code=${encodeURIComponent(appErr.code)}`);
    }
  }

  /**
   * GET /runner/departments
   * On 401: silent re-auth then retry once.
   */
  async getDepartments(): Promise<DeptResponse> {
    let res = await fetchWithRetry(`${API_BASE}/runner/departments`);

    if (res.status === 401) {
      await this._silentReAuth();
      res = await fetchWithRetry(`${API_BASE}/runner/departments`);
    }

    if (!res.ok) {
      throw await parseErrorBody(res);
    }

    return res.json() as Promise<DeptResponse>;
  }

  /**
   * POST /runner/switch
   * On 401: silent re-auth then retry once.
   * On success: updates store.currentDept.
   */
  async switchDepartment(targetDeptId: number): Promise<SwitchResponse> {
    const doFetch = () =>
      fetchWithRetry(`${API_BASE}/runner/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDeptId }),
      });

    let res = await doFetch();

    if (res.status === 401) {
      await this._silentReAuth();
      res = await doFetch();
    }

    if (!res.ok) {
      throw await parseErrorBody(res);
    }

    const data: SwitchResponse = await res.json();
    getState().setCurrentDept({
      id: data.currentDept.id,
      name: data.currentDept.name,
      groupId: data.currentDept.id,
    });
    return data;
  }
}

export const apiClient = new RunnerAPIClient();

// ---------------------------------------------------------------------------
// Named exports — backward-compatible with existing screen components
// ---------------------------------------------------------------------------

/**
 * Returns the list of allowed departments.
 * pbxFqdn is accepted for backward compatibility but is not sent to the API —
 * the session token already encodes PBX context.
 */
export async function getDepartments(_pbxFqdn?: string): Promise<Department[]> {
  const data = await apiClient.getDepartments();
  // Propagate ivrAccess flag to store when departments are refreshed
  if (data.ivrAccess !== undefined) {
    getState().setIvrAccess(data.ivrAccess);
  }
  return data.allowedDepts.map((d) => ({ id: d.id, name: d.name, groupId: d.id }));
}

/**
 * Switches the runner to the target department.
 * pbxFqdn is accepted for backward compatibility but is unused.
 */
export async function switchDepartment(
  _pbxFqdn: string,
  targetGroupId: number,
): Promise<void> {
  await apiClient.switchDepartment(targetGroupId);
}
