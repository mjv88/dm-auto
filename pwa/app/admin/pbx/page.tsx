'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { adminGet, adminPost, adminPut, adminDelete } from '@/lib/adminApi';
import { useRunnerStore } from '@/lib/store';
import DataTable, { type Column } from '@/components/admin/DataTable';
import PbxModal from '@/components/admin/PbxModal';
import type { PBXCredential } from '@/types/auth';

export default function PbxPage() {
  const [pbxList, setPbxList] = useState<PBXCredential[]>([]);
  const [search, setSearch] = useState('');
  const [modalPbx, setModalPbx] = useState<PBXCredential | null | undefined>(undefined);

  const load = useCallback(() => {
    adminGet<{ pbxList: PBXCredential[] }>('/admin/pbx')
      .then((data) => setPbxList(data.pbxList ?? []))
      .catch(console.error);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = (pbxList ?? []).filter(
    (p) => {
      const name = (p.pbxName ?? '').toLowerCase();
      const fqdn = (p.pbxFqdn ?? '').toLowerCase();
      const q = search.toLowerCase();
      return name.includes(q) || fqdn.includes(q);
    },
  );

  async function handleSave(data: {
    pbxFqdn: string;
    pbxName: string;
    authMode: 'xapi' | 'user_credentials';
    clientId?: string;
    secret?: string;
    username?: string;
    password?: string;
  }) {
    const credentials =
      data.authMode === 'xapi'
        ? { mode: 'xapi' as const, clientId: data.clientId ?? '', secret: data.secret ?? '' }
        : { mode: 'user_credentials' as const, username: data.username ?? '', password: data.password ?? '' };

    const payload = {
      fqdn: data.pbxFqdn,
      name: data.pbxName,
      authMode: data.authMode,
      credentials,
    };

    if (modalPbx) {
      await adminPut(`/admin/pbx/${modalPbx.id}`, {
        name: data.pbxName,
        credentials,
      });
    } else {
      const tenantId = useRunnerStore.getState().selectedAdminTenantId;
      if (!tenantId) {
        throw new Error('Please select a company from the dropdown before adding a PBX');
      }
      await adminPost('/admin/pbx', payload);
    }
    setModalPbx(undefined);
    load();
  }

  async function handleToggle(pbx: PBXCredential) {
    await adminPut(`/admin/pbx/${pbx.id}`, { isActive: !pbx.isActive });
    load();
  }

  async function handleDelete(pbx: PBXCredential) {
    if (!confirm(`Delete PBX "${pbx.pbxName}"?`)) return;
    await adminDelete(`/admin/pbx/${pbx.id}`);
    load();
  }

  const columns: Column<PBXCredential>[] = [
    { key: 'pbxName', header: 'Name' },
    { key: 'pbxFqdn', header: 'FQDN' },
    { key: 'authMode', header: 'Auth Mode' },
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
              {row.isActive ? 'Disable' : 'Enable'}
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
