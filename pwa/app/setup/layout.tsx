'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useRunnerStore } from '@/lib/store';
import WizardProgress from '@/components/setup/WizardProgress';

const STEP_PATHS = ['/setup/company', '/setup/pbx', '/setup/runners', '/setup/invite'];

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const sessionToken = useRunnerStore((s) => s.sessionToken);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!sessionToken) {
      router.replace('/login?redirect=/setup');
      return;
    }
    setReady(true);
  }, [sessionToken, router]);

  if (!ready) {
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

  const currentStep = STEP_PATHS.findIndex((p) => pathname?.startsWith(p));

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-lg">
        {currentStep >= 0 && <WizardProgress currentStep={currentStep} />}
        {children}
      </div>
    </main>
  );
}
