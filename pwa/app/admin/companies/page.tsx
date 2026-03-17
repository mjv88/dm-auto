'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { adminGet } from '@/lib/adminApi';
import { useRunnerStore } from '@/lib/store';
import DataTable from '@/components/admin/DataTable';
import AddCompanyModal from '@/components/admin/AddCompanyModal';

interface TenantRow {
  id: string;
  name: string;
  entraTenantId: string;
  entraGroupId: string;
  adminEmails: string[];
  isActive: boolean;
  createdAt: string;
}

interface TenantsResponse {
  tenants: TenantRow[];
  total: number;
  page: number;
  pages: number;
}

export default function CompaniesPage() {
  const role = useRunnerStore((s) => s.role);
  const setSelectedAdminTenantId = useRunnerStore((s) => s.setSelectedAdminTenantId);
  const router = useRouter();

  const [data, setData] = useState<TenantsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  // Gate: only super_admin can access this page
  useEffect(() => {
    if (role !== 'super_admin') {
      router.replace('/admin');
    }
  }, [role, router]);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '25');
      if (search) params.set('search', search);
      const result = await adminGet<TenantsResponse>(`/admin/tenants?${params.toString()}`);
      setData(result);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  const columns = [
    {
      key: 'name',
      header: 'Company',
      render: (row: TenantRow) => (
        <span className="font-medium text-gray-900">{row.name}</span>
      ),
    },
    {
      key: 'adminEmails',
      header: 'Admins',
      render: (row: TenantRow) =>
        row.adminEmails.length > 0 ? (
          <span className="text-sm text-gray-600">{row.adminEmails.join(', ')}</span>
        ) : (
          <span className="text-sm text-gray-400 italic">None assigned</span>
        ),
    },
    {
      key: 'entraGroupId',
      header: 'Entra Configured',
      render: (row: TenantRow) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            row.entraGroupId
              ? 'bg-green-100 text-green-800'
              : 'bg-yellow-100 text-yellow-800'
          }`}
        >
          {row.entraGroupId ? 'Yes' : 'Pending'}
        </span>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (row: TenantRow) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            row.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {row.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row: TenantRow) => new Date(row.createdAt).toLocaleDateString(),
    },
  ];

  if (role !== 'super_admin') return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Companies</h2>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          + Add Company
        </button>
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          placeholder="Search by company name…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
      </div>

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
            data={data.tenants}
            rowKey={(row) => row.id}
            actions={(row) => (
              <button
                type="button"
                onClick={() => {
                  setSelectedAdminTenantId(row.id);
                  router.push('/admin/settings');
                }}
                className="text-sm text-blue-600 hover:underline"
              >
                Settings
              </button>
            )}
          />

          {data.pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-gray-500">
                Page {data.page} of {data.pages} ({data.total} companies)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  type="button"
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
        <p className="text-sm text-gray-500">No companies found.</p>
      )}

      {showModal && (
        <AddCompanyModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            fetchTenants();
          }}
        />
      )}
    </div>
  );
}
