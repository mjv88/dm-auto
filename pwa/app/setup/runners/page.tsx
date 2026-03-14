'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getExtensions, createRunners } from '@/lib/setupApi';
import type { PbxExtension } from '@/lib/setupApi';
import ExtensionTable from '@/components/setup/ExtensionTable';

export default function SetupRunnersPage() {
  const router = useRouter();
  const [extensions, setExtensions] = useState<PbxExtension[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingExts, setLoadingExts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  useEffect(() => {
    getExtensions()
      .then((data) => {
        setExtensions(data.extensions);
        // Pre-select all by default
        setSelected(new Set(data.extensions.map((e) => e.extensionNumber)));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load extensions');
      })
      .finally(() => setLoadingExts(false));
  }, []);

  async function handleContinue() {
    if (selected.size === 0) {
      setError('Select at least one extension');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const res = await createRunners(Array.from(selected));
      setResult({ created: res.created.length, skipped: res.skipped.length });
      // Navigate after a brief delay so user can see the result
      setTimeout(() => router.push('/setup/invite'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create runners');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white shadow-lg p-8">
      <div className="text-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Select runners</h1>
        <p className="mt-1 text-sm text-gray-500">
          Choose which extensions should become runners.
        </p>
      </div>

      {loadingExts ? (
        <div className="flex items-center justify-center py-12">
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
      ) : (
        <>
          <ExtensionTable
            extensions={extensions}
            selected={selected}
            onSelectionChange={setSelected}
          />

          {error && (
            <p role="alert" className="mt-4 text-sm text-red-600 text-center">
              {error}
            </p>
          )}

          {result && (
            <p className="mt-4 text-sm text-green-700 text-center">
              Created {result.created} runner(s), skipped {result.skipped}.
            </p>
          )}

          <button
            type="button"
            disabled={submitting || selected.size === 0}
            onClick={handleContinue}
            className="mt-6 w-full flex items-center justify-center rounded-md px-4 py-3 min-h-[44px] text-sm font-medium text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: '#0078D4' }}
          >
            {submitting ? 'Creating runners...' : `Continue with ${selected.size} extension(s)`}
          </button>
        </>
      )}
    </div>
  );
}
