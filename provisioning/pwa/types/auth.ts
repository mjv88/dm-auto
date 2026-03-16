export interface AuthResult {
  idToken: string;
  email: string;
  name: string;
}

export interface AppError {
  code: string;
  message: string;
}

export interface Tenant {
  id: string;
  name: string;
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

export interface Extension {
  id: string;
  pbxCredentialId: string;
  extensionNumber: string;
  displayName: string | null;
  email: string | null;
  pbxUserId: number | null;
  provLinkExternal: string | null;
  provLinkFetchedAt: string | null;
  provisioningStatus: 'pending' | 'provisioning' | 'fetched' | 'delivered' | 'error';
  provisioningError: string | null;
  isSelected: boolean;
  fetchedAt: string;
  updatedAt: string;
  lastDeliveredAt: string | null;
}

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error';
