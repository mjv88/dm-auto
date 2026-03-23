import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { AuthStatus, RunnerProfile, Dept, PBXOption, AppError } from '@/types/auth';

type UserRole = 'super_admin' | 'admin' | 'manager' | 'runner';

interface RunnerStore {
  // Auth state
  authStatus: AuthStatus;
  runnerProfile: RunnerProfile | null;
  currentDept: Dept | null;
  allowedDepts: Dept[];
  pbxOptions: PBXOption[];
  selectedPbxFqdn: string | null;
  role: UserRole;
  selectedAdminTenantId: string | null;
  error: AppError | null;
  // Session token — httpOnly cookie handles auth; in-memory copy for JWT claims only
  sessionToken: string | null;
  // Impersonation — stores the super_admin's original token
  // TODO: move originalToken to server-side cookie via POST /admin/impersonate/stop
  originalToken: string | null;
  impersonatingEmail: string | null;

  // Actions
  setAuthStatus: (status: AuthStatus) => void;
  setRunnerProfile: (profile: RunnerProfile | null) => void;
  setCurrentDept: (dept: Dept | null) => void;
  setAllowedDepts: (depts: Dept[]) => void;
  setPbxOptions: (options: PBXOption[]) => void;
  setSelectedPbxFqdn: (fqdn: string | null) => void;
  setRole: (role: UserRole) => void;
  setSelectedAdminTenantId: (id: string | null) => void;
  setError: (error: AppError | null) => void;
  setSessionToken: (token: string | null) => void;
  startImpersonation: (email: string) => void;
  stopImpersonation: () => void;
  reset: () => void;
}

const initialState = {
  authStatus: 'idle' as AuthStatus,
  runnerProfile: null,
  currentDept: null,
  allowedDepts: [],
  pbxOptions: [],
  selectedPbxFqdn: null,
  role: 'runner' as UserRole,
  selectedAdminTenantId: null,
  error: null,
  sessionToken: null,
  originalToken: null,
  impersonatingEmail: null,
};

// ---------------------------------------------------------------------------
// Shallow-equality selectors for array/object fields — prevent unnecessary
// re-renders when the store is updated but the selected value is unchanged.
// ---------------------------------------------------------------------------

export function useAllowedDepts() {
  return useRunnerStore(useShallow((s) => s.allowedDepts));
}

export function usePbxOptions() {
  return useRunnerStore(useShallow((s) => s.pbxOptions));
}

export function useCurrentDept() {
  return useRunnerStore(useShallow((s) => s.currentDept));
}

export function useRunnerProfile() {
  return useRunnerStore(useShallow((s) => s.runnerProfile));
}

export const useRunnerStore = create<RunnerStore>((set) => ({
  ...initialState,

  setAuthStatus: (status) => set({ authStatus: status }),
  setRunnerProfile: (profile) => set({ runnerProfile: profile }),
  setCurrentDept: (dept) => set({ currentDept: dept }),
  setAllowedDepts: (depts) => set({ allowedDepts: depts }),
  setPbxOptions: (options) => set({ pbxOptions: options }),
  setSelectedPbxFqdn: (fqdn) => set({ selectedPbxFqdn: fqdn }),
  setRole: (role) => set({ role }),
  setSelectedAdminTenantId: (id) => set({ selectedAdminTenantId: id }),
  setError: (error) => set({ error }),
  setSessionToken: (token) => {
    set({ sessionToken: token });
  },
  startImpersonation: (email) => {
    // TODO: remove sessionStorage once the API supports POST /admin/impersonate/stop
    // that restores the original cookie server-side
    if (typeof window !== 'undefined') {
      const currentToken = useRunnerStore.getState().sessionToken;
      if (currentToken) sessionStorage.setItem('originalToken', currentToken);
    }
    set({
      impersonatingEmail: email,
    });
  },
  stopImpersonation: () => {
    // TODO: replace with POST /admin/impersonate/stop once the API sets the
    // original cookie server-side. For now, read originalToken from sessionStorage.
    if (typeof window !== 'undefined') {
      const original = sessionStorage.getItem('originalToken');
      sessionStorage.removeItem('originalToken');
      if (original) {
        // Temporarily set the originalToken as a manual cookie until server-side support exists
        // The page reload in the caller will trigger GET /auth/me to pick up the correct session
      }
    }
    set({
      originalToken: null,
      impersonatingEmail: null,
      role: 'runner',
      selectedAdminTenantId: null,
    });
  },
  reset: () => {
    if (typeof window !== 'undefined') {
      // TODO: remove once impersonation uses server-side cookie restore
      sessionStorage.removeItem('originalToken');
    }
    set({
      authStatus: 'idle' as AuthStatus,
      runnerProfile: null,
      currentDept: null,
      allowedDepts: [],
      pbxOptions: [],
      selectedPbxFqdn: null,
      role: 'runner' as UserRole,
      selectedAdminTenantId: null,
      error: null,
      sessionToken: null,
      originalToken: null,
      impersonatingEmail: null,
    });
  },
}));

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

/**
 * Restore session on client mount.
 * Calls GET /auth/me — the httpOnly cookie is sent automatically.
 * On success, stores the session metadata (role, token claims) in Zustand.
 * Call this in the root layout's useEffect to avoid hydration mismatch.
 */
export async function restoreSession(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      const token: string = data.sessionToken;
      const session = data.session;
      useRunnerStore.setState({
        sessionToken: token,
        role: session.role ?? 'runner',
        authStatus: 'authenticated',
      });
    }
  } catch {
    // /auth/me unavailable — user will be prompted to log in
  }
}
