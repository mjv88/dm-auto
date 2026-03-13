import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type Configuration,
  type AccountInfo,
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
    storeAuthStateInCookie: false,
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

export function getStoredAccount(): AccountInfo | null {
  // Synchronous — reads from sessionStorage without initializing MSAL
  if (typeof window === 'undefined') return null;
  if (!_msalInstance) return null;
  const accounts = _msalInstance.getAllAccounts();
  return accounts.length > 0 ? accounts[0] : null;
}

export { msalConfig, loginRequest };
