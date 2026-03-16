'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { adminGet, adminPost } from '@/lib/adminApi';
import { useProvisioningStore } from '@/lib/store';
import DataTable, { type Column } from '@/components/admin/DataTable';
import type { Extension } from '@/types/auth';

interface ExtensionsResponse {
  extensions: Extension[];
  total: number;
  page: number;
  pages: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  provisioning: 'bg-yellow-100 text-yellow-700',
  fetched: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
};

export default function ExtensionsPage() {
  const [data, setData] = useState<ExtensionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [provisioning, setProvisioning] = useState(false);
  const [provisionResult, setProvisionResult] = useState<{ provisioned: string[]; failed: string[]; errors: Record<string, string> } | null>(null);
  const selectedAdminTenantId = useProvisioningStore((s) => s.selectedAdminTenantId);

  const fetchExtensions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '50');
      if (filterStatus) params.set('status', filterStatus);
      const result = await adminGet<ExtensionsResponse>(`/admin/extensions?${params.toString()}`);
      setData(result);
    } catch {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, selectedAdminTenantId]);

  useEffect(() => {
    fetchExtensions();
  }, [fetchExtensions]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!data) return;
    if (selected.size === data.extensions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.extensions.map((e) => e.id)));
    }
  }

  async function handleBulkProvision() {
    if (selected.size === 0) return;
    setProvisioning(true);
    setProvisionResult(null);
    try {
      const result = await adminPost<{ provisioned: string[]; failed: string[]; errors: Record<string, string> }>(
        '/admin/extensions/provision',
        { extensionIds: Array.from(selected) },
      );
      setProvisionResult(result);
      setSelected(new Set());
      fetchExtensions();
    } catch {
      // Error handled silently
    } finally {
      setProvisioning(false);
    }
  }

  async function handleReprovision(id: string) {
    try {
      await adminPost(`/admin/extensions/${id}/reprovision`, {});
      fetchExtensions();
    } catch {
      // Error handled silently
    }
  }

  const columns: Column<Extension>[] = [
    {
      key: 'select',
      header: '',
      render: (row) => (
        <input
          type="checkbox"
          checked={selected.has(row.id)}
          onChange={() => toggleSelect(row.id)}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
      ),
    },
    { key: 'extensionNumber', header: 'Ext #' },
    { key: 'displayName', header: 'Name', render: (row) => row.displayName ?? '-' },
    { key: 'email', header: 'Email', render: (row) => row.email ?? '-' },
    {
      key: 'provisioningStatus',
      header: 'Status',
      render: (row) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            STATUS_COLORS[row.provisioningStatus] ?? 'bg-gray-100 text-gray-700'
          }`}
        >
          {row.provisioningStatus}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-gray-900">Extensions</h2>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <button
              onClick={handleBulkProvision}
              disabled={provisioning}
              className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: '#0078D4' }}
            >
              {provisioning ? 'Provisioning...' : `Provision Selected (${selected.size})`}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="provisioning">Provisioning</option>
          <option value="fetched">Fetched</option>
          <option value="delivered">Delivered</option>
          <option value="error">Error</option>
        </select>
        {data && data.extensions.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className="text-sm text-blue-600 hover:underline"
          >
            {selected.size === data.extensions.length ? 'Deselect All' : 'Select All'}
          </button>
        )}
      </div>

      {provisionResult && (
        <div className="bg-white rounded-xl shadow p-4 text-sm space-y-1">
          <p className="text-green-700">Provisioned: {provisionResult.provisioned.length}</p>
          {provisionResult.failed.length > 0 && (
            <p className="text-red-600">Failed: {provisionResult.failed.length}</p>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg
            className="animate-spin h-6 w-6 text-blue-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        </div>
      ) : data ? (
        <>
          <DataTable
            columns={columns}
            data={data.extensions}
            rowKey={(row) => row.id}
            actions={(row) => (
              <div className="flex gap-2 text-xs">
                <button
                  onClick={() => handleReprovision(row.id)}
                  className="text-blue-600 hover:underline"
                >
                  Re-provision
                </button>
              </div>
            )}
          />

          {data.pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-gray-500">
                Page {data.page} of {data.pages} ({data.total} extensions)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  disabled={page >= data.pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-500">No data available.</p>
      )}
    </div>
  );
}
