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
  createdAt: string;
  entraEmail: string;
  extensionNumber: string;
  fromDeptId: string | null;
  fromDeptName: string | null;
  toDeptId: string;
  toDeptName: string | null;
  status: string;
  pbxFqdn?: string;
  errorMessage?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
  durationMs?: number;
  impersonatedBy?: string | null;
}

interface PaginatedAudit {
  logs: AuditEntry[];
  total: number;
  page: number;
  pages: number;
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
    pbx: searchParams.get('pbx') ?? '',
    status: searchParams.get('status') ?? '',
    email: searchParams.get('email') ?? '',
  });
  const [exporting, setExporting] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '50');
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.pbx) params.set('pbx', filters.pbx);
    if (filters.status) params.set('status', filters.status);
    if (filters.email) params.set('email', filters.email);

    adminGet<PaginatedAudit>(`/admin/audit?${params}`)
      .then((res) => {
        setEntries(res.logs);
        setTotalPages(res.pages || 1);
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
      if (filters.pbx) params.set('pbx', filters.pbx);
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
      key: 'createdAt',
      header: 'Time',
      render: (row) => {
        const d = new Date(row.createdAt);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        const secs = String(d.getSeconds()).padStart(2, '0');
        return (
          <span className="text-xs whitespace-nowrap">
            {day}.{month}.{year} {hours}:{mins}:{secs}
          </span>
        );
      },
    },
    {
      key: 'extensionNumber',
      header: 'Ext.',
      render: (row) => (
        <span className="text-xs font-mono inline-flex items-center gap-1">
          {row.extensionNumber || '—'}
          {row.impersonatedBy && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-600"
              title={`Impersonated by ${row.impersonatedBy}`}
            >
              IMP
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'fromDeptName',
      header: 'From → To',
      render: (row) => (
        <span className="text-xs">
          {row.fromDeptName || '—'} → {row.toDeptName || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
            row.status === 'success'
              ? 'bg-green-100 text-green-700'
              : row.status === 'denied'
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {row.status}
        </span>
      ),
    },
    {
      key: 'pbxFqdn',
      header: 'PBX',
      render: (row) => (
        <span className="text-xs text-gray-500">{row.pbxFqdn || '—'}</span>
      ),
    },
    {
      key: 'durationMs',
      header: 'Duration',
      render: (row) => (
        <span className="text-xs text-gray-400">
          {row.durationMs != null ? `${row.durationMs}ms` : '—'}
        </span>
      ),
    },
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
