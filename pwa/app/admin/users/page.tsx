'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminGet } from '@/lib/adminApi';
import { useRunnerStore } from '@/lib/store';
import DataTable from '@/components/admin/DataTable';
import RoleModal from '@/components/admin/RoleModal';

interface UserRow {
  id: string;
  email: string;
  role: string;
  tenantId: string | null;
  emailVerified: boolean;
  createdAt: string;
}

interface UsersResponse {
  users: UserRow[];
  total: number;
  page: number;
  pages: number;
}

export default function UsersPage() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filterRole, setFilterRole] = useState('');
  const [filterEmail, setFilterEmail] = useState('');
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const selectedAdminTenantId = useRunnerStore((s) => s.selectedAdminTenantId);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '25');
      if (filterRole) params.set('role', filterRole);
      if (filterEmail) params.set('email', filterEmail);
      const result = await adminGet<UsersResponse>(`/admin/users?${params.toString()}`);
      setData(result);
    } catch {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  }, [page, filterRole, filterEmail, selectedAdminTenantId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const columns = [
    { key: 'email', header: 'Email' },
    {
      key: 'role',
      header: 'Role',
      render: (row: UserRow) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            row.role === 'admin'
              ? 'bg-purple-100 text-purple-800'
              : row.role === 'manager'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-100 text-gray-800'
          }`}
        >
          {row.role}
        </span>
      ),
    },
    {
      key: 'emailVerified',
      header: 'Verified',
      render: (row: UserRow) => (row.emailVerified ? 'Yes' : 'No'),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row: UserRow) => new Date(row.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">User Management</h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by email..."
          value={filterEmail}
          onChange={(e) => { setFilterEmail(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
        <select
          value={filterRole}
          onChange={(e) => { setFilterRole(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="runner">Runner</option>
        </select>
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
            data={data.users}
            rowKey={(row) => row.id}
            actions={(row) =>
              row.role !== 'admin' ? (
                <button
                  onClick={() => setEditingUser(row)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Change Role
                </button>
              ) : null
            }
          />

          {/* Pagination */}
          {data.pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-gray-500">
                Page {data.page} of {data.pages} ({data.total} users)
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

      {editingUser && (
        <RoleModal
          userId={editingUser.id}
          currentRole={editingUser.role}
          userName={editingUser.email}
          onClose={() => setEditingUser(null)}
          onSuccess={() => {
            setEditingUser(null);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}
