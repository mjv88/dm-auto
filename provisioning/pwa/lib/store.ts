import { create } from 'zustand';
import type { AuthStatus, AppError } from '@/types/auth';

type UserRole = 'super_admin' | 'admin' | 'runner';

interface ProvisioningStore {
  // Auth state
  authStatus: AuthStatus;
  role: UserRole;
  selectedAdminTenantId: string | null;
  error: AppError | null;
  // Session token -- memory only, never persisted to localStorage
  sessionToken: string | null;

  // Actions
  setAuthStatus: (status: AuthStatus) => void;
  setRole: (role: UserRole) => void;
  setSelectedAdminTenantId: (id: string | null) => void;
  setError: (error: AppError | null) => void;
  setSessionToken: (token: string | null) => void;
  reset: () => void;
}

const initialState = {
  authStatus: 'idle' as AuthStatus,
  role: 'runner' as UserRole,
  selectedAdminTenantId: null,
  error: null,
  sessionToken: null,
};

export const useProvisioningStore = create<ProvisioningStore>((set) => ({
  ...initialState,

  setAuthStatus: (status) => set({ authStatus: status }),
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
    useProvisioningStore.setState({
      sessionToken: token,
      role: payload.role ?? 'runner',
      authStatus: 'authenticated',
    });
  } catch {
    sessionStorage.removeItem('sessionToken');
  }
}
