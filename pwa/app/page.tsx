'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { acquireTokenSilent } from '@/lib/auth';
import { useRunnerStore } from '@/lib/store';

/**
 * Root page: attempt silent SSO on every load.
 * - Intune-managed devices → zero-tap (MSAL finds cached token automatically).
 * - Unauthenticated → redirect to /login.
 * - Authenticated, multi-PBX → redirect to /select-pbx.
 * - Authenticated, single-PBX → redirect to /departments.
 *
 * Never renders blank — always shows a spinner.
 */
export default function Home() {
  const router = useRouter();
  const authStatus = useRunnerStore((s) => s.authStatus);
  const pbxOptions = useRunnerStore((s) => s.pbxOptions);
  const setAuthStatus = useRunnerStore((s) => s.setAuthStatus);
  const setError = useRunnerStore((s) => s.setError);

  useEffect(() => {
    // If already authenticated (e.g. navigated back here), route immediately
    if (authStatus === 'authenticated') {
      if (pbxOptions.length > 1) {
        router.replace('/select-pbx');
      } else {
        router.replace('/departments');
      }
      return;
    }

    // Attempt silent SSO (handles Intune zero-tap and cached sessions)
    setAuthStatus('loading');
    acquireTokenSilent()
      .then(() => {
        // acquireTokenSilent either returns a token (handled by callback page)
        // or triggers a redirect. If we get here without a redirect, the
        // callback page will run via MSAL's handleRedirectPromise.
        router.replace('/callback');
      })
      .catch(() => {
        // No cached session and no redirect triggered (unusual) → login page
        setAuthStatus('idle');
        setError(null);
        router.replace('/login');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <svg
        className="animate-spin h-8 w-8 text-blue-600"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
    </main>
  );
}
