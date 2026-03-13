'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { adminGet, adminPost, adminPut, adminDelete } from '@/lib/adminApi';
import DataTable, { type Column } from '@/components/admin/DataTable';
import PbxModal from '@/components/admin/PbxModal';
import type { PBXCredential } from '@/types/auth';

export default function PbxPage() {
  const [pbxList, setPbxList] = useState<PBXCredential[]>([]);
  const [search, setSearch] = useState('');
  const [modalPbx, setModalPbx] = useState<PBXCredential | null | undefined>(undefined);

  const load = useCallback(() => {
    adminGet<PBXCredential[]>('/admin/pbx').then(setPbxList).catch(console.error);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = pbxList.filter(
    (p) =>
      p.pbx_name.toLowerCase().includes(search.toLowerCase()) ||
      p.pbx_fqdn.toLowerCase().includes(search.toLowerCase()),
  );

  async function handleSave(data: {
    pbx_fqdn: string;
    pbx_name: string;
    auth_mode: 'xapi' | 'user_credentials';
    api_key?: string;
    username?: string;
    password?: string;
  }) {
    if (modalPbx) {
      await adminPut(`/admin/pbx/${modalPbx.id}`, data);
    } else {
      await adminPost('/admin/pbx', data);
    }
    setModalPbx(undefined);
    load();
  }

  async function handleToggle(pbx: PBXCredential) {
    await adminPut(`/admin/pbx/${pbx.id}`, { is_active: !pbx.is_active });
    load();
  }

  async function handleDelete(pbx: PBXCredential) {
    if (!confirm(`Delete PBX "${pbx.pbx_name}"?`)) return;
    await adminDelete(`/admin/pbx/${pbx.id}`);
    load();
  }

  const columns: Column<PBXCredential>[] = [
    { key: 'pbx_name', header: 'Name' },
    { key: 'pbx_fqdn', header: 'FQDN' },
    { key: 'auth_mode', header: 'Auth Mode' },
    {
      key: 'is_active',
      header: 'Status',
      render: (row) => (
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
            row.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {row.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">PBX Systems</h2>
        <div className="flex gap-2">
          <Link
            href="/admin/pbx/import"
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50"
          >
            Import CSV
          </Link>
          <button
            onClick={() => setModalPbx(null)}
            className="rounded-md px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: '#0078D4' }}
          >
            + Add PBX
          </button>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search by name or FQDN..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full sm:w-72 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        actions={(row) => (
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => handleToggle(row)}
              className="text-blue-600 hover:underline"
            >
              {row.is_active ? 'Disable' : 'Enable'}
            </button>
            <button onClick={() => setModalPbx(row)} className="text-blue-600 hover:underline">
              Edit
            </button>
            <button onClick={() => handleDelete(row)} className="text-red-500 hover:underline">
              Delete
            </button>
          </div>
        )}
      />

      {modalPbx !== undefined && (
        <PbxModal
          pbx={modalPbx}
          onSave={handleSave}
          onClose={() => setModalPbx(undefined)}
        />
      )}
    </div>
  );
}
