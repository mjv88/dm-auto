'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRunnerStore } from '@/lib/store';
import { getDepartments } from '@/lib/api';
import LoadingScreen from '@/components/LoadingScreen';

export default function SelectPBXPage() {
  const router = useRouter();
  const pbxOptions = useRunnerStore((s) => s.pbxOptions);
  const setSelectedPbxFqdn = useRunnerStore((s) => s.setSelectedPbxFqdn);
  const setAllowedDepts = useRunnerStore((s) => s.setAllowedDepts);
  const runnerProfile = useRunnerStore((s) => s.runnerProfile);

  const [loadingFqdn, setLoadingFqdn] = useState<string | null>(null);

  // Only shown when more than one PBX option exists
  if (pbxOptions.length <= 1) {
    return <LoadingScreen />;
  }

  async function handleSelect(fqdn: string) {
    setLoadingFqdn(fqdn);
    setSelectedPbxFqdn(fqdn);
    try {
      const depts = await getDepartments(fqdn);
      setAllowedDepts(depts);
    } catch {
      // departments will be re-fetched on the departments page
    }
    router.push('/departments');
  }

  return (
    <main className="min-h-screen bg-brand-bg px-4 py-8">
      <div className="max-w-sm mx-auto space-y-4">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-brand-text">
            Willkommen{runnerProfile?.name ? `, ${runnerProfile.name}` : ''}
          </h1>
          <p className="mt-1 text-sm text-brand-secondary">
            Select your PBX:
          </p>
        </div>

        {pbxOptions.map((pbx) => (
          <button
            key={pbx.pbx_fqdn}
            onClick={() => handleSelect(pbx.pbx_fqdn)}
            disabled={loadingFqdn !== null}
            aria-label={`Select ${pbx.pbx_name}`}
            className="w-full rounded-card bg-white shadow-card px-4 py-4 text-left flex items-center justify-between hover:shadow-md transition-shadow active:scale-[0.98] disabled:opacity-60"
          >
            <div className="min-w-0">
              <p className="font-bold text-brand-text truncate">{pbx.pbx_name}</p>
              <p className="text-xs text-brand-secondary mt-0.5 truncate">{pbx.pbx_fqdn}</p>
            </div>
            <svg
              className="h-5 w-5 text-brand-secondary/50 flex-shrink-0 ml-3"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>
    </main>
  );
}
