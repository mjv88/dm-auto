'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCompany } from '@/lib/setupApi';

export default function SetupCompanyPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Company name is required');
      return;
    }

    setLoading(true);
    try {
      await createCompany(name.trim());
      router.push('/setup/pbx');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create company');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white shadow-lg p-8">
      <div className="text-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Create your company</h1>
        <p className="mt-1 text-sm text-gray-500">
          Give your company a name to get started.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="company-name" className="block text-sm font-medium text-gray-700 mb-1">
            Company name
          </label>
          <input
            id="company-name"
            type="text"
            required
            maxLength={255}
            placeholder="Acme Corp"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 text-center">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center rounded-md px-4 py-3 min-h-[44px] text-sm font-medium text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: '#0078D4' }}
        >
          {loading ? 'Creating...' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
