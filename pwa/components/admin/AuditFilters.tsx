'use client';

import { useState, useEffect } from 'react';
import { adminGet } from '@/lib/adminApi';
import type { PBXCredential } from '@/types/auth';

export interface AuditFilterValues {
  from: string;
  to: string;
  pbx_fqdn: string;
  status: string;
  email: string;
}

interface AuditFiltersProps {
  initial: AuditFilterValues;
  onChange: (filters: AuditFilterValues) => void;
}

const presets: { label: string; days: number }[] = [
  { label: 'Last 24h', days: 1 },
  { label: 'Last 7d', days: 7 },
  { label: 'Last 30d', days: 30 },
];

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AuditFilters({ initial, onChange }: AuditFiltersProps) {
  const [filters, setFilters] = useState<AuditFilterValues>(initial);
  const [pbxList, setPbxList] = useState<PBXCredential[]>([]);

  useEffect(() => {
    adminGet<PBXCredential[]>('/admin/pbx').then(setPbxList).catch(console.error);
  }, []);

  function update(patch: Partial<AuditFilterValues>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    onChange(next);
  }

  return (
    <div className="flex flex-wrap gap-2 items-end">
      {/* Date presets */}
      <div className="flex gap-1">
        {presets.map((p) => (
          <button
            key={p.days}
            onClick={() => update({ from: daysAgo(p.days), to: today() })}
            className="rounded-md px-3 py-1.5 text-xs font-medium border border-gray-300 hover:bg-gray-50"
          >
            {p.label}
          </button>
        ))}
      </div>

      <input
        type="date"
        value={filters.from}
        onChange={(e) => update({ from: e.target.value })}
        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
      />
      <input
        type="date"
        value={filters.to}
        onChange={(e) => update({ to: e.target.value })}
        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
      />

      <select
        value={filters.pbx_fqdn}
        onChange={(e) => update({ pbx_fqdn: e.target.value })}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
      >
        <option value="">All PBX</option>
        {pbxList.map((p) => (
          <option key={p.id} value={p.pbx_fqdn}>
            {p.pbx_name}
          </option>
        ))}
      </select>

      <select
        value={filters.status}
        onChange={(e) => update({ status: e.target.value })}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
      >
        <option value="">All Status</option>
        <option value="success">Success</option>
        <option value="failure">Failure</option>
      </select>

      <input
        type="text"
        placeholder="Search email..."
        value={filters.email}
        onChange={(e) => update({ email: e.target.value })}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm w-full sm:w-48"
      />
    </div>
  );
}
