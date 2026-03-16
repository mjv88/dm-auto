'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProvisioningStore } from '@/lib/store';

/**
 * Root page: redirect based on auth state.
 * - Authenticated: redirect to /provision
 * - Not authenticated: redirect to /login
 */
export default function Home() {
  const router = useRouter();
  const authStatus = useProvisioningStore((s) => s.authStatus);
  const sessionToken = useProvisioningStore((s) => s.sessionToken);

  useEffect(() => {
    if (authStatus === 'authenticated' || sessionToken) {
      router.replace('/provision');
    } else {
      router.replace('/login');
    }
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
