'use client';

import { useState, useEffect } from 'react';
import type { PBXCredential } from '@/types/auth';

interface PbxForm {
  pbx_fqdn: string;
  pbx_name: string;
  auth_mode: 'xapi' | 'user_credentials';
  api_key?: string;
  username?: string;
  password?: string;
}

interface PbxModalProps {
  pbx?: PBXCredential | null;
  onSave: (data: PbxForm) => Promise<void>;
  onClose: () => void;
}

export default function PbxModal({ pbx, onSave, onClose }: PbxModalProps) {
  const [form, setForm] = useState<PbxForm>({
    pbx_fqdn: '',
    pbx_name: '',
    auth_mode: 'xapi',
    api_key: '',
    username: '',
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pbx) {
      setForm({
        pbx_fqdn: pbx.pbx_fqdn,
        pbx_name: pbx.pbx_name,
        auth_mode: pbx.auth_mode,
        api_key: '',
        username: '',
        password: '',
      });
    }
  }, [pbx]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {pbx ? 'Edit PBX' : 'Add PBX'}
        </h2>
        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">FQDN</label>
            <input
              type="text"
              value={form.pbx_fqdn}
              onChange={(e) => setForm({ ...form, pbx_fqdn: e.target.value })}
              placeholder="pbx.example.com"
              required
              disabled={!!pbx}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={form.pbx_name}
              onChange={(e) => setForm({ ...form, pbx_name: e.target.value })}
              placeholder="Main PBX"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Auth Mode</label>
            <select
              value={form.auth_mode}
              onChange={(e) =>
                setForm({ ...form, auth_mode: e.target.value as 'xapi' | 'user_credentials' })
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="xapi">xAPI</option>
              <option value="user_credentials">User Credentials</option>
            </select>
          </div>

          {form.auth_mode === 'xapi' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <input
                type="password"
                value={form.api_key ?? ''}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                placeholder={pbx ? '(unchanged)' : 'Enter API key'}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {form.auth_mode === 'user_credentials' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  value={form.username ?? ''}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="admin"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={form.password ?? ''}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={pbx ? '(unchanged)' : 'Enter password'}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: '#0078D4' }}
            >
              {saving ? 'Saving...' : pbx ? 'Update' : 'Add PBX'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
