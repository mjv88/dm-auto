'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('Missing verification token');
      return;
    }

    async function verify() {
      try {
        const resp = await fetch(`${API_URL}/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error((err as { message?: string }).message ?? 'Verification failed');
        }
        setStatus('success');
      } catch (err) {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Verification failed');
      }
    }

    verify();
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-lg p-8 flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900">Email verification</h1>
        </div>

        {status === 'loading' && (
          <div className="flex flex-col items-center gap-3">
            <svg
              className="animate-spin h-6 w-6 text-blue-600"
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
            <p className="text-sm text-gray-500">Verifying your email…</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center space-y-4">
            <p className="text-sm text-green-700">Email verified!</p>
            <Link
              href="/departments"
              className="inline-block text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Go to app
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center space-y-4">
            <p role="alert" className="text-sm text-red-600">{errorMessage}</p>
            <Link
              href="/login"
              className="inline-block text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Back to login
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
