'use client';

import { useState, useEffect, useMemo } from 'react';
import type { PBXCredential } from '@/types/auth';
import { adminGet } from '@/lib/adminApi';

// ── Caller ID helpers ─────────────────────────────────────────────────────────

/** Strips any character that is not + or a digit; + is only kept at index 0. */
function sanitizeCallerId(raw: string): string {
  const first = raw.startsWith('+') ? '+' : '';
  const digits = raw.replace(/\D/g, '');
  return first + digits;
}

const CALLER_ID_REGEX = /^\+?\d{1,20}$/;

function isValidCallerId(v: string): boolean {
  return v === '' || CALLER_ID_REGEX.test(v);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PbxExtension {
  extensionNumber:  string;
  email:            string | null;
  displayName:      string | null;
  currentGroupName: string | null;
  outboundCallerId: string | null;
}

interface PbxRingGroup {
  id:       number;
  name:     string;
  number:   string;
  groupIds: number[];
}

interface RunnerForm {
  email: string;
  extension: string;
  pbxId: string;
  allowedDeptIds: number[];
  outboundCallerId: string;
  deptCallerIds: Record<string, string>;
}

interface RunnerData {
  id: string;
  entraEmail: string;
  extensionNumber: string;
  pbxFqdn: string;
  pbxCredentialId?: string;
  allowedDeptIds: number[];
  outboundCallerId?: string | null;
  deptCallerIds?: Record<string, string> | null;
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function RunnerModal({ runner, pbxList, departments, onSave, onClose }: RunnerModalProps) {
  const [form, setForm] = useState<RunnerForm>({
    email: '',
    extension: '',
    pbxId: pbxList[0]?.id ?? '',
    allowedDeptIds: [],
    outboundCallerId: '',
    deptCallerIds: {},
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // PBX extension picker state (add mode only)
  const [extensions, setExtensions] = useState<PbxExtension[]>([]);
  const [extSearch, setExtSearch] = useState('');
  const [extLoading, setExtLoading] = useState(false);

  // Ring groups for the selected PBX (always loaded for dept display)
  const [pbxRingGroups, setPbxRingGroups] = useState<PbxRingGroup[]>([]);

  // Pre-fill in edit mode
  useEffect(() => {
    if (runner) {
      setForm({
        email:            runner.entraEmail,
        extension:        runner.extensionNumber,
        pbxId:            runner.pbxCredentialId ?? pbxList.find((p) => p.pbxFqdn === runner.pbxFqdn)?.id ?? '',
        allowedDeptIds:   runner.allowedDeptIds,
        outboundCallerId: runner.outboundCallerId ?? '',
        deptCallerIds:    runner.deptCallerIds ?? {},
      });
    }
  }, [runner, pbxList]);

  // Fetch ring groups whenever PBX changes (always — used for dept display)
  useEffect(() => {
    if (!form.pbxId) return;
    setPbxRingGroups([]);
    adminGet<{ ringGroups: PbxRingGroup[] }>(`/admin/pbx/${form.pbxId}/ring-groups`)
      .then(data => setPbxRingGroups(data.ringGroups))
      .catch(() => { /* silently fail */ });
  }, [form.pbxId]);

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
      email:            ext.email ?? prev.email,
      extension:        ext.extensionNumber,
      // Auto-fill default caller ID from PBX if not already set
      outboundCallerId: prev.outboundCallerId || ext.outboundCallerId || '',
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

  function setDeptCallerId(deptId: number, value: string) {
    const sanitized = sanitizeCallerId(value);
    setForm((prev) => ({
      ...prev,
      deptCallerIds: { ...prev.deptCallerIds, [String(deptId)]: sanitized },
    }));
  }

  function validate(): string | null {
    if (form.outboundCallerId && !isValidCallerId(form.outboundCallerId)) {
      return 'Default Caller ID must be digits, optionally starting with +';
    }
    for (const [deptId, callerId] of Object.entries(form.deptCallerIds)) {
      if (callerId && !isValidCallerId(callerId)) {
        const dept = departments.find((d) => String(d.id) === deptId);
        return `Caller ID for "${dept?.name ?? deptId}" must be digits, optionally starting with +`;
      }
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setSaving(true);
    setError(null);

    // Strip empty-string values before sending to API
    const payload: RunnerForm = {
      ...form,
      outboundCallerId: form.outboundCallerId.trim(),
      deptCallerIds: Object.fromEntries(
        Object.entries(form.deptCallerIds).filter(([, v]) => v.trim() !== ''),
      ),
    };

    try {
      await onSave(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const checkedDepts = useMemo(
    () => departments.filter((d) => form.allowedDeptIds.includes(d.id)),
    [departments, form.allowedDeptIds],
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {runner ? 'Edit Runner' : 'Add Runner'}
        </h2>
        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">

          {/* PBX — first, drives the extension list */}
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

          {/* Email */}
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

          {/* Extension */}
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

          {/* Default Caller ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Caller ID
              <span className="ml-1 text-xs font-normal text-gray-400">— used when no per-department override is set</span>
            </label>
            <input
              type="text"
              value={form.outboundCallerId}
              onChange={(e) => setForm({ ...form, outboundCallerId: sanitizeCallerId(e.target.value) })}
              placeholder="+49123456789"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {!form.outboundCallerId && (
              <p className="mt-1 text-xs text-amber-600">
                No default caller ID set — without this, the PBX will retain the previously applied caller ID when switching to a department with no override.
              </p>
            )}
          </div>

          {/* Departments with inline per-dept Caller ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Departments</label>
            <div className="border border-gray-300 rounded-md p-2 max-h-52 overflow-y-auto space-y-1">
              {departments.length === 0 && (
                <p className="text-xs text-gray-400">No departments available</p>
              )}
              {departments.map((dept) => {
                const checked = form.allowedDeptIds.includes(dept.id);
                return (
                  <div key={dept.id}>
                    <div className="flex items-center gap-2 py-0.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDept(dept.id)}
                        className="rounded border-gray-300 shrink-0"
                      />
                      <span className="flex-1 text-sm text-gray-700">{dept.name}</span>
                      {checked && (
                        <input
                          type="text"
                          value={form.deptCallerIds[String(dept.id)] ?? ''}
                          onChange={(e) => setDeptCallerId(dept.id, e.target.value)}
                          placeholder={form.outboundCallerId || 'Caller ID'}
                          className="w-48 rounded border border-gray-200 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-700 placeholder-gray-300"
                        />
                      )}
                    </div>
                    {checked && pbxRingGroups.length > 0 && (() => {
                      const deptIdNum = Number(dept.id);
                      const forDept = pbxRingGroups.filter(rg => rg.groupIds.includes(deptIdNum));
                      const notDept  = pbxRingGroups.filter(rg => !rg.groupIds.includes(deptIdNum));
                      if (forDept.length === 0 && notDept.length === 0) return null;
                      return (
                        <div className="ml-5 mb-1 flex flex-wrap gap-1 items-center">
                          <span className="text-xs text-gray-400 mr-0.5">↳</span>
                          {forDept.map(rg => (
                            <span key={rg.id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-700 border border-green-200">
                              <span>✓</span> {rg.name}
                            </span>
                          ))}
                          {notDept.map(rg => (
                            <span key={rg.id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-gray-50 text-gray-400 border border-gray-200">
                              <span>✕</span> {rg.name}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
            {checkedDepts.length > 0 && (
              <p className="mt-1 text-xs text-gray-400">
                Per-dept caller ID overrides the default. Leave blank to use the default.
              </p>
            )}
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
