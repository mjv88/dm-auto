'use client';

export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useProvisioningStore } from '@/lib/store';

function ErrorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeError = useProvisioningStore((s) => s.error);

  const code = storeError?.code ?? searchParams.get('code') ?? 'UNKNOWN';

  const messages: Record<string, { title: string; message: string }> = {
    AUTH_FAILED: { title: 'Authentication Failed', message: 'Sign-in failed. Please try again.' },
    TENANT_NOT_REGISTERED: { title: 'Organisation Not Registered', message: 'Your organisation has not been set up. Contact your admin.' },
    UNKNOWN: { title: 'Something went wrong', message: 'An unexpected error occurred. Please try again.' },
  };

  const { title, message } = messages[code] ?? messages['UNKNOWN'];

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-lg p-8 text-center space-y-4">
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500">{message}</p>
        <button
          onClick={() => router.push('/login')}
          className="mt-4 w-full rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: '#0078D4' }}
        >
          Back to login
        </button>
      </div>
    </main>
  );
}

export default function ErrorPage() {
  return (
    <Suspense>
      <ErrorContent />
    </Suspense>
  );
}
