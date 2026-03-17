'use client';

import { useState } from 'react';
import { adminPost } from '@/lib/adminApi';
import { useRunnerStore } from '@/lib/store';

interface Tenant {
  id: string;
  name: string;
  adminEmails: string[];
  entraTenantId: string;
  entraGroupId: string;
  isActive: boolean;
  createdAt: string;
}

interface Props {
  onClose: () => void;
  onSuccess: (tenant: Tenant) => void;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';

export default function AddCompanyModal({ onClose, onSuccess }: Props) {
  // Read current user's email from JWT payload as fallback for self-assignment guard
  const sessionToken = useRunnerStore((s) => s.sessionToken);
  const myEmail = (() => {
    try {
      if (!sessionToken) return '';
      const payload = JSON.parse(atob(sessionToken.split('.')[1]));
      return (payload.email ?? payload.entraEmail ?? '').toLowerCase();
    } catch {
      return '';
    }
  })();

  const [name, setName] = useState('');
  const [adminEmails, setAdminEmails] = useState<string[]>(['']);
  const [entraTenantId, setEntraTenantId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Tenant | null>(null);

  function addEmailRow() {
    setAdminEmails((prev) => [...prev, '']);
  }

  function updateEmail(index: number, value: string) {
    setAdminEmails((prev) => prev.map((e, i) => (i === index ? value : e)));
  }

  function removeEmail(index: number) {
    setAdminEmails((prev) => prev.filter((_, i) => i !== index));
  }

  function validate(): string | null {
    if (!name.trim()) return 'Company name is required.';
    const filled = adminEmails.map((e) => e.trim()).filter(Boolean);
    if (filled.length === 0) return 'Add at least one admin email.';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const e of filled) {
      if (!emailRegex.test(e)) return `"${e}" is not a valid email.`;
      if (myEmail && e.toLowerCase() === myEmail) {
        return 'You cannot assign yourself as a company admin. Use a different email.';
      }
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (entraTenantId && !uuidRegex.test(entraTenantId)) {
      return 'Entra Tenant ID must be a valid UUID (or leave it blank).';
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        adminEmails: adminEmails.map((e) => e.trim()).filter(Boolean),
      };
      if (entraTenantId.trim()) body.entraTenantId = entraTenantId.trim();

      const result = await adminPost<{ tenant: Tenant }>('/admin/tenants', body);
      setCreated(result.tenant);
      onSuccess(result.tenant);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create company.');
    } finally {
      setSaving(false);
    }
  }

  function inviteLink(tenantId: string) {
    return `${APP_URL}/register?company=${tenantId}`;
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 space-y-5">
        {!created ? (
          <>
            <h2 className="text-lg font-semibold text-gray-900">Add Company</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Company Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Admin Emails */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Admin(s) <span className="text-red-500">*</span>
                  <span className="ml-1 text-xs font-normal text-gray-400">— at least one, not yourself</span>
                </label>
                <div className="space-y-2">
                  {adminEmails.map((email, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => updateEmail(i, e.target.value)}
                        placeholder="admin@company.com"
                        className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                      {adminEmails.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeEmail(i)}
                          className="text-sm text-red-500 hover:text-red-700 px-2"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addEmailRow}
                  className="mt-2 text-sm text-blue-600 hover:underline"
                >
                  + Add another admin
                </button>
              </div>

              {/* Entra Tenant ID (optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Entra Tenant ID
                  <span className="ml-1 text-xs font-normal text-gray-400">— optional, can be set later in Settings</span>
                </label>
                <input
                  type="text"
                  value={entraTenantId}
                  onChange={(e) => setEntraTenantId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Creating…' : 'Create Company'}
                </button>
              </div>
            </form>
          </>
        ) : (
          /* Success state — show invite links */
          <>
            <div className="flex items-center gap-2">
              <span className="text-green-600 text-xl">✓</span>
              <h2 className="text-lg font-semibold text-gray-900">
                {created.name} created
              </h2>
            </div>
            <p className="text-sm text-gray-600">
              Share the invite link(s) below. Each admin uses the link to register and will automatically be assigned to this company.
            </p>

            <div className="space-y-3">
              {created.adminEmails.map((email) => (
                <div key={email} className="border border-gray-200 rounded-md p-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">{email}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-gray-50 border rounded px-2 py-1 truncate font-mono">
                      {inviteLink(created.id)}
                    </code>
                    <button
                      onClick={() => copyToClipboard(inviteLink(created.id))}
                      className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-400">
              The admin can add their PBX systems and runners after logging in.
            </p>

            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
