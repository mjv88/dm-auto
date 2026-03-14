'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { acquireTokenSilent, loginWithEmail } from '@/lib/auth';
import { useRunnerStore } from '@/lib/store';

// Error message shown when browser blocks the redirect/popup
const BLOCKED_MESSAGES = [
  'popup_window_error',
  'popupWindowError',
  'BrowserAuthError',
  'interaction_in_progress',
];

function isPopupBlocked(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return BLOCKED_MESSAGES.some((m) => msg.includes(m.toLowerCase()));
}

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const setAuthStatus = useRunnerStore((s) => s.setAuthStatus);
  const setSessionToken = useRunnerStore((s) => s.setSessionToken);
  const setRole = useRunnerStore((s) => s.setRole);
  const setError = useRunnerStore((s) => s.setError);

  const msLoginUrl =
    typeof window !== 'undefined'
      ? `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID ?? ''}&response_type=code&redirect_uri=${encodeURIComponent(window.location.origin + '/callback')}&scope=openid%20profile%20email`
      : '#';

  async function handleSignIn() {
    setLoading(true);
    setPopupBlocked(false);
    setAuthStatus('loading');
    try {
      await acquireTokenSilent();
      // If silent auth succeeds, the callback page will handle the rest.
      // If it triggers a redirect, the browser navigates away — loading state
      // persists visually until the redirect completes.
    } catch (err) {
      if (isPopupBlocked(err)) {
        setPopupBlocked(true);
        setLoading(false);
        setAuthStatus('idle');
      } else {
        setAuthStatus('error');
        setError({ code: 'AUTH_FAILED', message: 'Sign-in failed. Please try again.' });
        setLoading(false);
      }
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-lg p-8 flex flex-col items-center gap-6">
        {/* Microsoft logo */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 23 23"
          aria-label="Microsoft logo"
        >
          <rect x="1"  y="1"  width="10" height="10" fill="#F25022" />
          <rect x="12" y="1"  width="10" height="10" fill="#7FBA00" />
          <rect x="1"  y="12" width="10" height="10" fill="#00A4EF" />
          <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
        </svg>

        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900">Runner Hub</h1>
          <p className="mt-1 text-sm text-gray-500">
            Sign in with your organisation&apos;s Microsoft account
          </p>
        </div>

        <button
          onClick={handleSignIn}
          disabled={loading}
          aria-label={loading ? 'Signing in…' : 'Sign in with Microsoft'}
          className="w-full flex items-center justify-center gap-3 rounded-md px-4 py-3 min-h-[44px] text-sm font-medium text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: '#0078D4' }}
        >
          {loading ? (
            <>
              <Spinner />
              Signing in…
            </>
          ) : (
            'Sign in with Microsoft'
          )}
        </button>

        {popupBlocked && (
          <div role="alert" className="text-center space-y-2">
            <p className="text-sm text-amber-700">
              Your browser blocked the sign-in window.
            </p>
            <a
              href={msLoginUrl}
              className="inline-block text-sm font-medium text-blue-600 underline hover:text-blue-800"
              aria-label="Open Microsoft login page manually"
            >
              Open login page manually
            </a>
          </div>
        )}

        <p className="text-xs text-center text-gray-400">
          Works with any Microsoft 365 organisation
        </p>

        {/* Divider */}
        <div className="w-full flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Email / password form */}
        <form
          className="w-full flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setEmailError('');
            setEmailLoading(true);
            try {
              const result = await loginWithEmail(email, password);
              setSessionToken(result.sessionToken);
              // Decode JWT to extract role
              try {
                const payload = JSON.parse(atob(result.sessionToken.split('.')[1]));
                setRole(payload.role ?? 'runner');
              } catch { /* fallback to runner */ }
              setAuthStatus('authenticated');
              router.push('/departments');
            } catch (err) {
              setEmailError(err instanceof Error ? err.message : 'Login failed');
            } finally {
              setEmailLoading(false);
            }
          }}
        >
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          {emailError && (
            <p role="alert" className="text-sm text-red-600 text-center">
              {emailError}
            </p>
          )}

          <button
            type="submit"
            disabled={emailLoading}
            className="w-full flex items-center justify-center gap-3 rounded-md px-4 py-3 min-h-[44px] text-sm font-medium text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: '#0078D4' }}
          >
            {emailLoading ? (
              <>
                <Spinner />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>

          <div className="flex items-center justify-between text-sm">
            <Link href="/forgot-password" className="text-blue-600 hover:text-blue-800">
              Forgot password?
            </Link>
            <Link href="/register" className="text-blue-600 hover:text-blue-800">
              Create account
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12" cy="12" r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
