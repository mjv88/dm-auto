'use client';

import { useRunnerStore } from '@/lib/store';

export default function ImpersonationBanner() {
  const impersonatingEmail = useRunnerStore((s) => s.impersonatingEmail);
  const stopImpersonation = useRunnerStore((s) => s.stopImpersonation);

  if (!impersonatingEmail) return null;

  return (
    <div className="bg-orange-500 text-white text-center py-2 px-4 text-sm font-medium">
      Impersonating: {impersonatingEmail}
      <button
        onClick={() => { stopImpersonation(); window.location.href = '/admin/users'; }}
        className="ml-4 underline font-bold"
      >
        Stop Impersonating
      </button>
    </div>
  );
}
