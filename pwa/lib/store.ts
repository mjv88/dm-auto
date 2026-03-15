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
  // Session token — memory only, never persisted to localStorage/sessionStorage
  sessionToken: string | null;

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
    if (typeof window !== 'undefined') {
      if (token) {
        sessionStorage.setItem('sessionToken', token);
      } else {
        sessionStorage.removeItem('sessionToken');
      }
    }
    set({ sessionToken: token });
  },
  reset: () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('sessionToken');
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
    });
  },
}));

/**
 * Restore session from sessionStorage on client mount.
 * Call this in the root layout's useEffect to avoid hydration mismatch.
 */
export function restoreSession(): void {
  if (typeof window === 'undefined') return;
  try {
    const token = sessionStorage.getItem('sessionToken');
    if (!token) return;
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      sessionStorage.removeItem('sessionToken');
      return;
    }
    useRunnerStore.setState({
      sessionToken: token,
      role: payload.role ?? 'runner',
      authStatus: 'authenticated',
    });
  } catch {
    sessionStorage.removeItem('sessionToken');
  }
}
