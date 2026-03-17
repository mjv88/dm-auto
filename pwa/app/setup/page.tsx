'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSetupStatus } from '@/lib/setupApi';

export default function SetupIndexPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceNew = searchParams.get('new') === '1';
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If ?new=1, always start from company step
    if (forceNew) {
      router.replace('/setup/company');
      return;
    }

    getSetupStatus()
      .then((status) => {
        if (!status.hasCompany) {
          router.replace('/setup/company');
        } else if (!status.hasPbx) {
          router.replace('/setup/pbx');
        } else if (!status.hasRunners) {
          router.replace('/setup/runners');
        } else {
          // Already completed — show option to start new
          setLoading(false);
        }
      })
      .catch(() => {
        router.replace('/setup/company');
      });
  }, [router, forceNew]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
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
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <p className="text-gray-600">Setup is already complete for your current company.</p>
      <button
        onClick={() => router.push('/setup?new=1')}
        className="rounded-md px-6 py-3 text-sm font-medium text-white"
        style={{ backgroundColor: '#0078D4' }}
      >
        + Set Up New Company
      </button>
    </div>
  );
}
