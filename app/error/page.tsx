'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useRunnerStore } from '@/lib/store';
import ErrorScreen from '@/components/ErrorScreen';

function ErrorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeError = useRunnerStore((s) => s.error);

  // Prefer store error; fall back to URL param
  const code = storeError?.code ?? searchParams.get('code') ?? 'UNKNOWN';

  function handleRetry() {
    router.push('/departments');
  }

  return <ErrorScreen errorCode={code} onRetry={handleRetry} />;
}

export default function ErrorPage() {
  return (
    <Suspense>
      <ErrorContent />
    </Suspense>
  );
}
