import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type Configuration,
} from '@azure/msal-browser';
import type { AuthResult } from '@/types/auth';

// Multi-tenant: authority uses "common" — tenant resolved at sign-in time
const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID ?? '',
    authority: 'https://login.microsoftonline.com/common',
    redirectUri:
      typeof window !== 'undefined'
        ? `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/callback`
        : '/callback',
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
};

const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
};

let _msalInstance: PublicClientApplication | null = null;

async function getMsalInstance(): Promise<PublicClientApplication> {
  if (!_msalInstance) {
    _msalInstance = new PublicClientApplication(msalConfig);
  }
  await _msalInstance.initialize();
  return _msalInstance;
}

export async function acquireTokenSilent(): Promise<AuthResult> {
  const pca = await getMsalInstance();

  // Handle redirect response first (returns result when coming back from MS login)
  const redirectResult = await pca.handleRedirectPromise();
  if (redirectResult) {
    return {
      idToken: redirectResult.idToken,
      email: redirectResult.account.username,
      name: redirectResult.account.name ?? redirectResult.account.username,
    };
  }

  const accounts = pca.getAllAccounts();

  if (accounts.length === 0) {
    // No cached account — trigger interactive login
    await pca.acquireTokenRedirect(loginRequest);
    // Never reached — browser navigates away
    throw new InteractionRequiredAuthError('login_required');
  }

  try {
    const result = await pca.acquireTokenSilent({
      ...loginRequest,
      account: accounts[0],
    });
    return {
      idToken: result.idToken,
      email: result.account.username,
      name: result.account.name ?? result.account.username,
    };
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      // Silent failed (consent, MFA, session expired) — redirect to MS login
      await pca.acquireTokenRedirect(loginRequest);
      // Never reached
      throw error;
    }
    throw error;
  }
}

export async function signOut(): Promise<void> {
  const pca = await getMsalInstance();
  const accounts = pca.getAllAccounts();
  if (accounts.length > 0) {
    await pca.logoutRedirect({ account: accounts[0] });
  }
}


// ---------------------------------------------------------------------------
// Email / password authentication
// ---------------------------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export interface EmailAuthResult {
  sessionToken: string;
  user: { id: string; email: string; emailVerified: boolean };
}

export async function loginWithEmail(email: string, password: string): Promise<EmailAuthResult> {
  const resp = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? 'Login failed');
  }
  return resp.json() as Promise<EmailAuthResult>;
}

export async function registerWithEmail(email: string, password: string, company?: string): Promise<EmailAuthResult> {
  const resp = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, ...(company ? { company } : {}) }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? 'Registration failed');
  }
  return resp.json() as Promise<EmailAuthResult>;
}
