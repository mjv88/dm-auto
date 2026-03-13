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
  pbx_fqdn: string;
  pbx_name: string;
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
  entra_group_id: string;
  admin_emails: string[];
}

export interface PBXCredential {
  id: string;
  pbx_fqdn: string;
  pbx_name: string;
  auth_mode: 'xapi' | 'user_credentials';
  is_active: boolean;
}

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error';
