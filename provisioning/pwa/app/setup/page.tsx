'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSetupStatus } from '@/lib/setupApi';

export default function SetupIndexPage() {
  const router = useRouter();

  useEffect(() => {
    getSetupStatus()
      .then((status) => {
        if (!status.hasCompany) {
          router.replace('/setup/company');
        } else if (!status.hasPbx) {
          router.replace('/setup/pbx');
        } else {
          router.replace('/admin');
        }
      })
      .catch(() => {
        router.replace('/setup/company');
      });
  }, [router]);

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
