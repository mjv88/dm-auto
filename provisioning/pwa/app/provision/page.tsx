'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProvisioningStore } from '@/lib/store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.tcx.sipphone14';

export default function ProvisionPage() {
  const router = useRouter();
  const sessionToken = useProvisioningStore((s) => s.sessionToken);
  const authStatus = useProvisioningStore((s) => s.authStatus);
  const [status, setStatus] = useState<'loading' | 'redirecting' | 'not_found' | 'not_ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!sessionToken && authStatus !== 'authenticated') {
      router.replace('/login');
      return;
    }

    async function provision() {
      try {
        const res = await fetch(`${API_URL}/provision/android`, {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
          redirect: 'manual',
        });

        if (res.type === 'opaqueredirect' || res.status === 302 || res.status === 301) {
          // The API returns a redirect to 3cxprovlink://
          // We need to follow it manually since fetch won't follow custom schemes
          const location = res.headers.get('Location');
          if (location) {
            setStatus('redirecting');
            window.location.href = location;
            return;
          }
        }

        if (res.ok) {
          // Response might be HTML redirect
          const text = await res.text();
          const match = text.match(/3cxprovlink:\/\/[^"'\s<]+/);
          if (match) {
            setStatus('redirecting');
            window.location.href = match[0];
            return;
          }
        }

        if (res.status === 404) {
          setStatus('not_found');
          return;
        }
        if (res.status === 425) {
          setStatus('not_ready');
          return;
        }

        setStatus('error');
        setErrorMessage('Failed to retrieve provisioning link');
      } catch {
        setStatus('error');
        setErrorMessage('Network error. Please check your connection.');
      }
    }

    provision();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-lg p-8 flex flex-col items-center gap-6">
        {status === 'loading' && (
          <>
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
            <p className="text-sm text-gray-600">Loading provisioning link...</p>
          </>
        )}

        {status === 'redirecting' && (
          <>
            <svg
              className="h-12 w-12 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-900">Opening 3CX App</p>
              <p className="text-sm text-gray-500 mt-2">
                If the 3CX app does not open automatically:
              </p>
              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 text-sm font-medium text-blue-600 hover:text-blue-800 underline"
              >
                Install 3CX from Play Store
              </a>
            </div>
          </>
        )}

        {status === 'not_found' && (
          <div className="text-center space-y-3">
            <p className="text-lg font-semibold text-gray-900">Extension Not Found</p>
            <p className="text-sm text-gray-500">
              Your extension hasn&apos;t been set up yet. Contact your administrator.
            </p>
          </div>
        )}

        {status === 'not_ready' && (
          <div className="text-center space-y-3">
            <p className="text-lg font-semibold text-gray-900">Not Ready Yet</p>
            <p className="text-sm text-gray-500">
              Your provisioning link is being prepared. Please try again in a few minutes or contact your administrator.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 rounded-md px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: '#0078D4' }}
            >
              Try Again
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center space-y-3">
            <p className="text-lg font-semibold text-gray-900">Error</p>
            <p className="text-sm text-gray-500">{errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 rounded-md px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: '#0078D4' }}
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
