export interface AuthResult {
  idToken: string;
  email: string;
  name: string;
}

export interface Dept {
  id: number;
  name: string;
  groupId: number;
}

export interface PBXOption {
  pbxFqdn: string;
  pbxName: string;
}

export interface RunnerProfile {
  id: string;
  name: string;
  email: string;
  extension: string;
  pbxFqdn: string | null;
  allowedDepts: Dept[];
  currentDept: Dept | null;
}

export interface AppError {
  code: string;
  message: string;
}

export interface Tenant {
  id: string;
  name: string;
  entraTenantId?: string;
  entraGroupId: string;
  adminEmails: string[];
  isActive?: boolean;
}

export interface PBXCredential {
  id: string;
  pbxFqdn: string;
  pbxName: string;
  authMode: 'xapi' | 'user_credentials';
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error';
