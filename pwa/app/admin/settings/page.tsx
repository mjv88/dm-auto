'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { adminGet, adminPut } from '@/lib/adminApi';
import type { Tenant } from '@/types/auth';

export default function SettingsPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [name, setName] = useState('');
  const [entraGroupId, setEntraGroupId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminGet<Tenant>('/admin/tenants/me')
      .then((data) => {
        setTenant(data);
        setName(data.name);
        setEntraGroupId(data.entra_group_id);
      })
      .catch((err) => setError(err.message));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await adminPut('/admin/tenants/me', { name, entra_group_id: entraGroupId });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (error && !tenant) {
    return <p className="text-sm text-red-500 py-8 text-center">{error}</p>;
  }

  if (!tenant) {
    return <p className="text-sm text-gray-400 py-8 text-center">Loading settings...</p>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Tenant Settings</h2>

      <form onSubmit={handleSave} className="bg-white rounded-xl shadow p-6 space-y-4 max-w-lg">
        {error && <p className="text-sm text-red-500">{error}</p>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tenant Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Entra Group ID <span className="text-gray-400">(3CX Runners group)</span>
          </label>
          <input
            type="text"
            value={entraGroupId}
            onChange={(e) => setEntraGroupId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tenant ID</label>
          <input
            type="text"
            value={tenant.id}
            readOnly
            className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Admin Emails</label>
          <input
            type="text"
            value={tenant.admin_emails.join(', ')}
            readOnly
            className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: '#0078D4' }}
        >
          {saved ? 'Saved!' : saving ? 'Saving...' : 'Save settings'}
        </button>
      </form>
    </div>
  );
}
