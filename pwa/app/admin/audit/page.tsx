'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { adminGet, adminFetch } from '@/lib/adminApi';
import DataTable, { type Column } from '@/components/admin/DataTable';
import AuditFilters, { type AuditFilterValues } from '@/components/admin/AuditFilters';
import AuditRowDetail from '@/components/admin/AuditRowDetail';

interface AuditEntry {
  id: string;
  timestamp: string;
  email: string;
  action: string;
  status: string;
  pbx_fqdn?: string;
  error_message?: string;
  ip_address?: string;
  user_agent?: string;
  device_id?: string;
}

interface PaginatedAudit {
  data: AuditEntry[];
  total: number;
  page: number;
  per_page: number;
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AuditPage() {
  const searchParams = useSearchParams();

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState<AuditFilterValues>({
    from: searchParams.get('from') ?? daysAgo(7),
    to: searchParams.get('to') ?? today(),
    pbx_fqdn: searchParams.get('pbx_fqdn') ?? '',
    status: searchParams.get('status') ?? '',
    email: searchParams.get('email') ?? '',
  });
  const [exporting, setExporting] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('per_page', '50');
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.pbx_fqdn) params.set('pbx_fqdn', filters.pbx_fqdn);
    if (filters.status) params.set('status', filters.status);
    if (filters.email) params.set('email', filters.email);

    adminGet<PaginatedAudit>(`/admin/audit?${params}`)
      .then((res) => {
        setEntries(res.data);
        setTotalPages(Math.ceil(res.total / res.per_page) || 1);
      })
      .catch(console.error);
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  function handleFilterChange(f: AuditFilterValues) {
    setFilters(f);
    setPage(1);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.pbx_fqdn) params.set('pbx_fqdn', filters.pbx_fqdn);
      if (filters.status) params.set('status', filters.status);
      if (filters.email) params.set('email', filters.email);

      const resp = await adminFetch(`/admin/audit/export?${params}`);
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${filters.from}-${filters.to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  }

  const columns: Column<AuditEntry>[] = [
    {
      key: 'timestamp',
      header: 'Time',
      render: (row) => (
        <span className="text-xs whitespace-nowrap">
          {new Date(row.timestamp).toLocaleString()}
        </span>
      ),
    },
    { key: 'email', header: 'Email' },
    { key: 'action', header: 'Action' },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
            row.status === 'success'
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {row.status}
        </span>
      ),
    },
    { key: 'pbx_fqdn', header: 'PBX' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Audit Log</h2>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-60"
        >
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      <AuditFilters initial={filters} onChange={handleFilterChange} />

      <DataTable
        columns={columns}
        data={entries}
        rowKey={(row) => row.id}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        expandedRow={(row) => <AuditRowDetail entry={row} />}
      />
    </div>
  );
}
