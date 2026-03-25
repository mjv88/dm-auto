'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { adminGet, adminPost, adminPut, adminDelete } from '@/lib/adminApi';
import DataTable, { type Column } from '@/components/admin/DataTable';
import RunnerModal from '@/components/admin/RunnerModal';
import type { PBXCredential } from '@/types/auth';

interface Runner {
  id: string;
  entraEmail: string;
  extensionNumber: string;
  pbxFqdn: string;
  pbxName: string;
  allowedDeptIds: number[];
  isActive: boolean;
  outboundCallerId?: string | null;
  deptCallerIds?: Record<string, string> | null;
  deptRingGroups?: Record<string, number[]> | null;
  ivrAccess?: boolean;
}

interface Department {
  id: number;
  name: string;
}

interface PaginatedRunners {
  runners: Runner[];
  total: number;
  page: number;
  pages: number;
}

export default function RunnersPage() {
  const [runners, setRunners] = useState<Runner[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [pbxFilter, setPbxFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pbxList, setPbxList] = useState<PBXCredential[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [modalRunner, setModalRunner] = useState<Runner | null | undefined>(undefined);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '25');
    if (search) params.set('email', search);
    if (pbxFilter) params.set('pbxId', pbxFilter);
    if (statusFilter) params.set('active', statusFilter);

    adminGet<PaginatedRunners>(`/admin/runners?${params}`)
      .then((res) => {
        setRunners(res.runners);
        setTotalPages(res.pages || 1);
      })
      .catch(console.error);
  }, [page, search, pbxFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    adminGet<{ pbxList: PBXCredential[] }>('/admin/pbx')
      .then((data) => setPbxList(data.pbxList ?? []))
      .catch(console.error);
    adminGet<Department[]>('/admin/departments')
      .then((data) => setDepartments(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  async function handleSave(data: {
    email: string;
    extension: string;
    pbxId: string;
    allowedDeptIds: number[];
    outboundCallerId: string;
    deptCallerIds: Record<string, string>;
    deptRingGroups: Record<string, number[]>;
  }) {
    // Build API body — strip empty outboundCallerId to null so Zod doesn't reject
    // it as "" and so the PUT handler writes null to DB (clearing an existing value)
    const apiBody = {
      ...data,
      outboundCallerId: data.outboundCallerId || null,
      ivrAccess: (data as any).ivrAccess,
    };

    if (modalRunner) {
      await adminPut(`/admin/runners/${modalRunner.id}`, apiBody);
    } else {
      await adminPost('/admin/runners', apiBody);
    }
    setModalRunner(undefined);
    load();
  }

  async function handleDelete(runner: Runner) {
    if (!confirm(`Remove runner "${runner.entraEmail}"?`)) return;
    await adminDelete(`/admin/runners/${runner.id}`);
    load();
  }

  const columns: Column<Runner>[] = [
    { key: 'entraEmail', header: 'Email' },
    { key: 'extensionNumber', header: 'Ext' },
    { key: 'pbxFqdn', header: 'PBX' },
    {
      key: 'isActive',
      header: 'Status',
      render: (row) => (
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
            row.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {row.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'ivrAccess' as any,
      header: 'IVR',
      render: (row: Runner) => (
        <button
          onClick={async (e) => {
            e.stopPropagation();
            try {
              await adminPut(`/admin/runners/${row.id}`, { ivrAccess: !row.ivrAccess });
              load();
            } catch (err) {
              console.error('Failed to toggle IVR access:', err);
            }
          }}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            row.ivrAccess ? 'bg-teal-500' : 'bg-gray-300'
          }`}
          title={row.ivrAccess ? 'IVR enabled — click to disable' : 'IVR disabled — click to enable'}
        >
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${
            row.ivrAccess ? 'translate-x-[18px]' : 'translate-x-[2px]'
          }`} />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Runners</h2>
        <button
          onClick={() => setModalRunner(null)}
          className="rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: '#0078D4' }}
        >
          + Add Runner
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Search by email..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-56"
        />
        <select
          value={pbxFilter}
          onChange={(e) => { setPbxFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All PBX</option>
          {pbxList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.pbxName}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={runners}
        rowKey={(row) => row.id}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        actions={(row) => (
          <div className="flex gap-2 text-xs">
            <button onClick={() => setModalRunner(row)} className="text-blue-600 hover:underline">
              Edit
            </button>
            <button onClick={() => handleDelete(row)} className="text-red-500 hover:underline">
              Remove
            </button>
          </div>
        )}
      />

      {modalRunner !== undefined && (
        <RunnerModal
          runner={modalRunner}
          pbxList={pbxList}
          departments={departments}
          onSave={handleSave}
          onClose={() => setModalRunner(undefined)}
        />
      )}
    </div>
  );
}
