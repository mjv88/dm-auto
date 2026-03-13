'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRunnerStore } from '@/lib/store';
import type { Tenant, PBXCredential } from '@/types/auth';

type Tab = 'tenant' | 'pbx' | 'runners';

interface Runner {
  id: string;
  email: string;
  extension: string;
  pbx_fqdn: string;
  allowed_dept_ids: number[];
  is_active: boolean;
}

export default function AdminPage() {
  const router = useRouter();
  const isAdmin = useRunnerStore((s) => s.isAdmin);
  const authStatus = useRunnerStore((s) => s.authStatus);
  const [activeTab, setActiveTab] = useState<Tab>('tenant');

  useEffect(() => {
    if (authStatus === 'authenticated' && !isAdmin) {
      router.replace('/departments');
    }
  }, [authStatus, isAdmin, router]);

  if (authStatus !== 'authenticated' || !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Admin Panel</h1>
          <button
            onClick={() => router.push('/departments')}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Back to Runner
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="bg-white border-b">
        <div className="max-w-3xl mx-auto flex">
          {([
            ['tenant', 'Tenant Settings'],
            ['pbx', 'PBX Credentials'],
            ['runners', 'Runners'],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {activeTab === 'tenant' && <TenantTab />}
        {activeTab === 'pbx' && <PBXTab />}
        {activeTab === 'runners' && <RunnersTab />}
      </div>
    </main>
  );
}

// ─── Tenant Settings Tab ──────────────────────────────────────────────────────

function TenantTab() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [entraGroupId, setEntraGroupId] = useState('');

  useEffect(() => {
    fetch(`${apiBase}/admin/tenants/me`)
      .then((r) => r.json())
      .then((data: Tenant) => {
        setTenant(data);
        setEntraGroupId(data.entra_group_id);
      })
      .catch(console.error);
  }, [apiBase]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(`${apiBase}/admin/tenants/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entra_group_id: entraGroupId }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (!tenant) {
    return <p className="text-sm text-gray-400">Loading…</p>;
  }

  return (
    <form onSubmit={handleSave} className="space-y-4 max-w-md">
      <Field label="Tenant name" value={tenant.name} readOnly />
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Entra Group ID <span className="text-gray-400">(3CX Runners group)</span>
        </label>
        <input
          type="text"
          value={entraGroupId}
          onChange={(e) => setEntraGroupId(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        style={{ backgroundColor: '#0078D4' }}
      >
        {saved ? 'Saved!' : saving ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  );
}

// ─── PBX Credentials Tab ─────────────────────────────────────────────────────

function PBXTab() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
  const [pbxList, setPbxList] = useState<PBXCredential[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fqdn: '', name: '', auth_mode: 'xapi' as 'xapi' | 'user_credentials', credentials: '' });

  useEffect(() => {
    fetch(`${apiBase}/admin/pbx`)
      .then((r) => r.json())
      .then(setPbxList)
      .catch(console.error);
  }, [apiBase]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`${apiBase}/admin/pbx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    // Refresh
    const updated = await fetch(`${apiBase}/admin/pbx`).then((r) => r.json());
    setPbxList(updated);
    setShowForm(false);
    setForm({ fqdn: '', name: '', auth_mode: 'xapi', credentials: '' });
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this PBX?')) return;
    await fetch(`${apiBase}/admin/pbx/${id}`, { method: 'DELETE' });
    setPbxList((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">PBX Systems</h2>
        <button onClick={() => setShowForm((v) => !v)} className="text-sm text-blue-600 hover:underline">
          {showForm ? 'Cancel' : '+ Add PBX'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl shadow p-4 space-y-3 max-w-md">
          <InputField label="FQDN" value={form.fqdn} onChange={(v) => setForm({ ...form, fqdn: v })} placeholder="pbx.example.com" required />
          <InputField label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Main PBX" required />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Auth mode</label>
            <select
              value={form.auth_mode}
              onChange={(e) => setForm({ ...form, auth_mode: e.target.value as 'xapi' | 'user_credentials' })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="xapi">xAPI</option>
              <option value="user_credentials">User credentials</option>
            </select>
          </div>
          <InputField label="Credentials (JSON)" value={form.credentials} onChange={(v) => setForm({ ...form, credentials: v })} placeholder='{"apiKey":"..."}' />
          <button type="submit" className="rounded-md px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: '#0078D4' }}>
            Add PBX
          </button>
        </form>
      )}

      <div className="space-y-2">
        {pbxList.map((pbx) => (
          <div key={pbx.id} className="bg-white rounded-xl shadow px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{pbx.pbx_name}</p>
              <p className="text-xs text-gray-400">{pbx.pbx_fqdn} · {pbx.auth_mode}</p>
            </div>
            <button onClick={() => handleDelete(pbx.id)} className="text-xs text-red-500 hover:underline">
              Delete
            </button>
          </div>
        ))}
        {pbxList.length === 0 && <p className="text-sm text-gray-400">No PBX systems configured.</p>}
      </div>
    </div>
  );
}

// ─── Runners Tab ─────────────────────────────────────────────────────────────

function RunnersTab() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
  const [runners, setRunners] = useState<Runner[]>([]);
  const [filterPbx, setFilterPbx] = useState('');
  const [filterEmail, setFilterEmail] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', extension: '', pbx_fqdn: '', allowed_dept_ids: '' });

  useEffect(() => {
    const params = new URLSearchParams();
    if (filterPbx) params.set('pbx_fqdn', filterPbx);
    if (filterEmail) params.set('email', filterEmail);
    fetch(`${apiBase}/admin/runners?${params}`)
      .then((r) => r.json())
      .then(setRunners)
      .catch(console.error);
  }, [apiBase, filterPbx, filterEmail]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`${apiBase}/admin/runners`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        allowed_dept_ids: form.allowed_dept_ids.split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean),
      }),
    });
    const updated = await fetch(`${apiBase}/admin/runners`).then((r) => r.json());
    setRunners(updated);
    setShowForm(false);
    setForm({ email: '', extension: '', pbx_fqdn: '', allowed_dept_ids: '' });
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this runner?')) return;
    await fetch(`${apiBase}/admin/runners/${id}`, { method: 'DELETE' });
    setRunners((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Runners</h2>
        <button onClick={() => setShowForm((v) => !v)} className="text-sm text-blue-600 hover:underline">
          {showForm ? 'Cancel' : '+ Add runner'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Filter by email"
          value={filterEmail}
          onChange={(e) => setFilterEmail(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <input
          type="text"
          placeholder="Filter by PBX FQDN"
          value={filterPbx}
          onChange={(e) => setFilterPbx(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl shadow p-4 space-y-3 max-w-md">
          <InputField label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="runner@org.com" required />
          <InputField label="Extension" value={form.extension} onChange={(v) => setForm({ ...form, extension: v })} placeholder="1001" required />
          <InputField label="PBX FQDN" value={form.pbx_fqdn} onChange={(v) => setForm({ ...form, pbx_fqdn: v })} placeholder="pbx.example.com" required />
          <InputField label="Allowed dept IDs (comma-separated)" value={form.allowed_dept_ids} onChange={(v) => setForm({ ...form, allowed_dept_ids: v })} placeholder="1,2,3" />
          <button type="submit" className="rounded-md px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: '#0078D4' }}>
            Add runner
          </button>
        </form>
      )}

      <div className="space-y-2">
        {runners.map((r) => (
          <div key={r.id} className="bg-white rounded-xl shadow px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{r.email}</p>
              <p className="text-xs text-gray-400">Ext {r.extension} · {r.pbx_fqdn}</p>
            </div>
            <button onClick={() => handleDelete(r.id)} className="text-xs text-red-500 hover:underline">
              Remove
            </button>
          </div>
        ))}
        {runners.length === 0 && <p className="text-sm text-gray-400">No runners found.</p>}
      </div>
    </div>
  );
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function Field({ label, value, readOnly }: { label: string; value: string; readOnly?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        readOnly={readOnly}
        className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
      />
    </div>
  );
}

function InputField({
  label, value, onChange, placeholder, required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
