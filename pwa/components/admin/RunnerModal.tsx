'use client';

import { useState, useEffect, useMemo } from 'react';
import type { PBXCredential } from '@/types/auth';
import { adminGet } from '@/lib/adminApi';

interface PbxExtension {
  extensionNumber: string;
  email: string | null;
  displayName: string | null;
  currentGroupName: string | null;
}

interface RunnerForm {
  email: string;
  extension: string;
  pbxId: string;
  allowedDeptIds: number[];
}

interface RunnerData {
  id: string;
  entraEmail: string;
  extensionNumber: string;
  pbxFqdn: string;
  pbxCredentialId?: string;
  allowedDeptIds: number[];
  isActive: boolean;
}

interface Department {
  id: number;
  name: string;
}

interface RunnerModalProps {
  runner?: RunnerData | null;
  pbxList: PBXCredential[];
  departments: Department[];
  onSave: (data: RunnerForm) => Promise<void>;
  onClose: () => void;
}

export default function RunnerModal({ runner, pbxList, departments, onSave, onClose }: RunnerModalProps) {
  const [form, setForm] = useState<RunnerForm>({
    email: '',
    extension: '',
    pbxId: pbxList[0]?.id ?? '',
    allowedDeptIds: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // PBX extension picker (add mode only)
  const [extensions, setExtensions] = useState<PbxExtension[]>([]);
  const [extSearch, setExtSearch] = useState('');
  const [extLoading, setExtLoading] = useState(false);

  useEffect(() => {
    if (runner) {
      setForm({
        email: runner.entraEmail,
        extension: runner.extensionNumber,
        pbxId: runner.pbxCredentialId ?? pbxList.find((p) => p.pbxFqdn === runner.pbxFqdn)?.id ?? '',
        allowedDeptIds: runner.allowedDeptIds,
      });
    }
  }, [runner, pbxList]);

  // Live-fetch PBX users whenever the selected PBX changes (add mode only)
  useEffect(() => {
    if (runner || !form.pbxId) return;
    let cancelled = false;
    setExtLoading(true);
    setExtensions([]);
    setExtSearch('');
    adminGet<{ users: PbxExtension[] }>(`/admin/pbx/${form.pbxId}/users`)
      .then(data => { if (!cancelled) setExtensions(data.users); })
      .catch(() => { /* silently fail — user can still type manually */ })
      .finally(() => { if (!cancelled) setExtLoading(false); });
    return () => { cancelled = true; };
  }, [form.pbxId, runner]);

  const filteredExtensions = useMemo(() => {
    if (!extSearch.trim()) return extensions;
    const q = extSearch.toLowerCase();
    return extensions.filter(e =>
      e.extensionNumber.includes(q) ||
      e.displayName?.toLowerCase().includes(q) ||
      e.email?.toLowerCase().includes(q),
    );
  }, [extensions, extSearch]);

  function pickExtension(ext: PbxExtension) {
    setForm(prev => ({
      ...prev,
      email: ext.email ?? prev.email,
      extension: ext.extensionNumber,
    }));
    setExtSearch('');
  }

  function toggleDept(id: number) {
    setForm((prev) => ({
      ...prev,
      allowedDeptIds: prev.allowedDeptIds.includes(id)
        ? prev.allowedDeptIds.filter((d) => d !== id)
        : [...prev.allowedDeptIds, id],
    }));
  }

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
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {runner ? 'Edit Runner' : 'Add Runner'}
        </h2>
        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* PBX selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PBX</label>
            <select
              value={form.pbxId}
              onChange={(e) => setForm({ ...form, pbxId: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {pbxList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.pbxName} ({p.pbxFqdn})
                </option>
              ))}
            </select>
          </div>

          {/* Extension picker (add mode only) */}
          {!runner && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pick from PBX users
                <span className="ml-1 text-xs font-normal text-gray-400">— or fill in manually below</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={extSearch}
                  onChange={e => setExtSearch(e.target.value)}
                  placeholder={
                    extLoading
                      ? 'Fetching users from PBX…'
                      : extensions.length === 0
                        ? 'PBX unavailable — fill in manually below'
                        : `Search from ${extensions.length} users…`
                  }
                  disabled={extLoading}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
                {extLoading && (
                  <svg className="absolute right-3 top-2.5 animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                )}
              </div>
              {extSearch && filteredExtensions.length > 0 && (
                <ul className="mt-1 border border-gray-200 rounded-md max-h-44 overflow-y-auto bg-white shadow-sm">
                  {filteredExtensions.slice(0, 50).map(ext => (
                    <li key={ext.extensionNumber}>
                      <button
                        type="button"
                        onClick={() => pickExtension(ext)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between"
                      >
                        <span>
                          <span className="font-medium">{ext.displayName ?? ext.email ?? ext.extensionNumber}</span>
                          {ext.email && ext.displayName && (
                            <span className="ml-1 text-gray-400 text-xs">{ext.email}</span>
                          )}
                        </span>
                        <span className="text-gray-400 text-xs ml-2">ext {ext.extensionNumber}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {extSearch && filteredExtensions.length === 0 && extensions.length > 0 && (
                <p className="mt-1 text-xs text-gray-400 px-1">No matches — fill in manually below.</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="runner@org.com"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Extension</label>
            <input
              type="text"
              value={form.extension}
              onChange={(e) => setForm({ ...form, extension: e.target.value })}
              placeholder="1001"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Departments</label>
            <div className="border border-gray-300 rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
              {departments.length === 0 && (
                <p className="text-xs text-gray-400">No departments available</p>
              )}
              {departments.map((dept) => (
                <label key={dept.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.allowedDeptIds.includes(dept.id)}
                    onChange={() => toggleDept(dept.id)}
                    className="rounded border-gray-300"
                  />
                  {dept.name}
                </label>
              ))}
            </div>
          </div>

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
              {saving ? 'Saving...' : runner ? 'Update' : 'Add Runner'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
