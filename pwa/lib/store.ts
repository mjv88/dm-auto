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
  // Session token — used for Bearer header auth (httpOnly cookies blocked by Cloudflare proxy)
  sessionToken: string | null;
  // Impersonation — stores the super_admin's original token
  // TODO: move originalToken to server-side cookie via POST /admin/impersonate/stop
  originalToken: string | null;
  impersonatingEmail: string | null;
  // IVR self-service — true when runner's departments grant IVR access
  ivrAccess: boolean;
  // Pricing dashboard access — true when user has been granted access by super_admin
  pricingAccess: boolean;

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
  setIvrAccess: (ivrAccess: boolean) => void;
  setPricingAccess: (pricingAccess: boolean) => void;
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
  ivrAccess: false,
  pricingAccess: false,
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

export const useIvrAccess = () => useRunnerStore((s) => s.ivrAccess);
export const usePricingAccess = () => useRunnerStore((s) => s.pricingAccess);

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
    if (typeof window !== 'undefined') {
      if (token) {
        sessionStorage.setItem('sessionToken', token);
      } else {
        sessionStorage.removeItem('sessionToken');
      }
    }
    set({ sessionToken: token });
  },
  setIvrAccess: (ivrAccess) => set({ ivrAccess }),
  setPricingAccess: (pricingAccess) => set({ pricingAccess }),
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
    if (typeof window !== 'undefined') {
      const original = sessionStorage.getItem('originalToken');
      sessionStorage.removeItem('originalToken');
      if (original) {
        // Restore the admin's original session token
        set({ sessionToken: original });
        sessionStorage.setItem('sessionToken', original);
      }
    }
    set({
      originalToken: null,
      impersonatingEmail: null,
    });
  },
  reset: () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('sessionToken');
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
      ivrAccess: false,
      pricingAccess: false,
    });
  },
}));

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

/**
 * Restore session on client mount.
 * 1. Try sessionStorage first (fast, avoids network round-trip).
 * 2. Fall back to GET /auth/me cookie check for same-origin deployments.
 * Call this in the root layout's useEffect to avoid hydration mismatch.
 */
export async function restoreSession(): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. Try sessionStorage (Bearer token auth — primary path)
  const stored = sessionStorage.getItem('sessionToken');
  if (stored) {
    try {
      const payload = JSON.parse(atob(stored.split('.')[1]));
      const role = payload.role ?? 'runner';
      useRunnerStore.setState({
        sessionToken: stored,
        role,
        authStatus: 'authenticated',
      });
      return;
    } catch {
      // Corrupted token — clear and fall through to cookie check
      sessionStorage.removeItem('sessionToken');
    }
  }

  // 2. Fall back to GET /auth/me (cookie auth — for same-origin deployments)
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      const session = data.session;
      useRunnerStore.setState({
        sessionToken: session.token ?? null,
        role: session.role ?? 'runner',
        pricingAccess: session.pricingAccess ?? false,
        authStatus: 'authenticated',
      });
    }
  } catch {
    // /auth/me unavailable — user will be prompted to log in
  }
}
