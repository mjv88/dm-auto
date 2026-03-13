'use client';

import { useState, useEffect } from 'react';
import type { PBXCredential } from '@/types/auth';

interface RunnerForm {
  email: string;
  extension: string;
  pbx_fqdn: string;
  allowed_dept_ids: number[];
}

interface RunnerData {
  id: string;
  email: string;
  extension: string;
  pbx_fqdn: string;
  allowed_dept_ids: number[];
  is_active: boolean;
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
    pbx_fqdn: pbxList[0]?.pbx_fqdn ?? '',
    allowed_dept_ids: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (runner) {
      setForm({
        email: runner.email,
        extension: runner.extension,
        pbx_fqdn: runner.pbx_fqdn,
        allowed_dept_ids: runner.allowed_dept_ids,
      });
    }
  }, [runner]);

  function toggleDept(id: number) {
    setForm((prev) => ({
      ...prev,
      allowed_dept_ids: prev.allowed_dept_ids.includes(id)
        ? prev.allowed_dept_ids.filter((d) => d !== id)
        : [...prev.allowed_dept_ids, id],
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
            <label className="block text-sm font-medium text-gray-700 mb-1">PBX</label>
            <select
              value={form.pbx_fqdn}
              onChange={(e) => setForm({ ...form, pbx_fqdn: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {pbxList.map((p) => (
                <option key={p.id} value={p.pbx_fqdn}>
                  {p.pbx_name} ({p.pbx_fqdn})
                </option>
              ))}
            </select>
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
                    checked={form.allowed_dept_ids.includes(dept.id)}
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
