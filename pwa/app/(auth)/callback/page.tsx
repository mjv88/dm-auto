'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { acquireTokenSilent } from '@/lib/auth';
import { useRunnerStore } from '@/lib/store';
import type { RunnerProfile, Dept, PBXOption } from '@/types/auth';

interface AuthApiResponse {
  mode?: 'direct' | 'select';
  runner?: RunnerProfile;
  currentDept?: Dept;
  allowedDepts?: Dept[];
  pbxOptions?: PBXOption[];
  isAdmin?: boolean;
  error?: string;
}

export default function CallbackPage() {
  const router = useRouter();
  const [statusText, setStatusText] = useState('Completing sign-in…');
  const [apiError, setApiError] = useState<string | null>(null);

  const setAuthStatus = useRunnerStore((s) => s.setAuthStatus);
  const setRunnerProfile = useRunnerStore((s) => s.setRunnerProfile);
  const setCurrentDept = useRunnerStore((s) => s.setCurrentDept);
  const setAllowedDepts = useRunnerStore((s) => s.setAllowedDepts);
  const setPbxOptions = useRunnerStore((s) => s.setPbxOptions);
  const setIsAdmin = useRunnerStore((s) => s.setIsAdmin);
  const setError = useRunnerStore((s) => s.setError);

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      setAuthStatus('loading');
      try {
        // Complete the MSAL redirect and obtain tokens
        const auth = await acquireTokenSilent();

        if (cancelled) return;
        setStatusText('Verifying with Runner API…');

        // Exchange the Microsoft id_token for a Runner API session
        const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
        const res = await fetch(`${apiBase}/runner/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: auth.idToken }),
        });

        if (cancelled) return;

        const data: AuthApiResponse = await res.json();

        if (!res.ok) {
          handleApiError(data.error ?? 'UNKNOWN');
          return;
        }

        // Populate store
        if (data.runner) setRunnerProfile(data.runner);
        if (data.currentDept) setCurrentDept(data.currentDept);
        if (data.allowedDepts) setAllowedDepts(data.allowedDepts);
        if (data.pbxOptions) setPbxOptions(data.pbxOptions);
        setIsAdmin(data.isAdmin ?? false);
        setAuthStatus('authenticated');

        // Route based on mode
        if (data.mode === 'select') {
          router.replace('/select-pbx');
        } else {
          router.replace('/departments');
        }
      } catch {
        if (!cancelled) {
          setAuthStatus('error');
          setError({ code: 'AUTH_FAILED', message: 'Authentication failed.' });
          router.replace('/error?code=AUTH_FAILED');
        }
      }
    }

    function handleApiError(code: string) {
      setAuthStatus('error');
      setError({ code, message: errorMessage(code) });
      // Terminal errors (no retry possible) go to the dedicated error page
      const terminalCodes = ['NOT_A_RUNNER', 'RUNNER_NOT_CONFIGURED'];
      if (terminalCodes.includes(code)) {
        router.replace(`/error?code=${encodeURIComponent(code)}`);
        return;
      }
      setApiError(code);
    }

    handleCallback();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (apiError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-lg p-8 text-center space-y-4">
          <div className="text-4xl" aria-hidden="true">⚠️</div>
          <h1 className="text-lg font-semibold text-gray-900">{errorTitle(apiError)}</h1>
          <p className="text-sm text-gray-500">{errorMessage(apiError)}</p>
          <button
            onClick={() => window.location.replace('/login')}
            className="mt-4 w-full rounded-md px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: '#0078D4' }}
          >
            Back to sign-in
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4">
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
        <p className="text-sm text-gray-600">{statusText}</p>
      </div>
    </main>
  );
}

function errorTitle(code: string): string {
  switch (code) {
    case 'TENANT_NOT_REGISTERED': return 'Organisation not registered';
    case 'NOT_IN_RUNNERS_GROUP': return 'Not authorised as a runner';
    case 'RUNNER_NOT_FOUND': return 'No runner profile found';
    default: return 'Sign-in error';
  }
}

function errorMessage(code: string): string {
  switch (code) {
    case 'TENANT_NOT_REGISTERED':
      return 'Your organisation has not been registered with Runner Hub. Contact your IT administrator.';
    case 'NOT_IN_RUNNERS_GROUP':
      return 'You are not authorised as a runner. Contact your IT administrator to be added to the Runners group.';
    case 'RUNNER_NOT_FOUND':
      return 'No runner profile was found for your account. Contact your IT administrator.';
    default:
      return 'An unexpected error occurred during sign-in. Please try again.';
  }
}
