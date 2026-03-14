import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { AuthStatus, RunnerProfile, Dept, PBXOption, AppError } from '@/types/auth';

type UserRole = 'admin' | 'manager' | 'runner';

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
  setSessionToken: (token) => set({ sessionToken: token }),
  reset: () => set(initialState),
}));
