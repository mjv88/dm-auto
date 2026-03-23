'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { adminGet, adminPost, adminPut, adminDelete } from '@/lib/adminApi';
import { useRunnerStore } from '@/lib/store';
import DataTable from '@/components/admin/DataTable';
import RoleModal from '@/components/admin/RoleModal';

interface TenantOption {
  id: string;
  name: string;
}

interface UserRow {
  id: string;
  email: string;
  role: string;
  tenantId: string | null;
  tenantName: string | null;
  pbxNames: string[];
  emailVerified: boolean;
  createdAt: string;
}

interface UsersResponse {
  users: UserRow[];
  total: number;
  page: number;
  pages: number;
}

function UserActionsMenu({
  row,
  myRole,
  tenantOptions,
  onChangeRole,
  onMove,
  onImpersonate,
  onDelete,
}: {
  row: UserRow;
  myRole: string | null;
  tenantOptions: TenantOption[];
  onChangeRole: () => void;
  onMove: (tenantId: string) => void;
  onImpersonate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isSuperAdmin = row.role === 'super_admin';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (isSuperAdmin) {
    return <span className="text-xs text-gray-400">&mdash;</span>;
  }

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-2 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded text-sm font-medium"
        title="Actions"
      >
        &#x22EF;
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 text-sm">
          <button
            onClick={() => { setOpen(false); onChangeRole(); }}
            className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700"
          >
            Change Role
          </button>
          {(myRole === 'admin' || myRole === 'super_admin') && tenantOptions.length > 1 && (
            <div className="border-t border-gray-100">
              <span className="block px-3 pt-1.5 pb-0.5 text-xs text-gray-400">Move to company</span>
              {tenantOptions
                .filter((t) => t.id !== row.tenantId)
                .slice(0, 5)
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setOpen(false); onMove(t.id); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700 truncate"
                  >
                    {t.name}
                  </button>
                ))}
            </div>
          )}
          {myRole === 'super_admin' && (
            <button
              onClick={() => { setOpen(false); onImpersonate(); }}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-orange-600 border-t border-gray-100"
            >
              Impersonate
            </button>
          )}
          <button
            onClick={() => { setOpen(false); onDelete(); }}
            className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-red-600 border-t border-gray-100"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default function UsersPage() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filterRole, setFilterRole] = useState('');
  const [filterEmail, setFilterEmail] = useState('');
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const selectedAdminTenantId = useRunnerStore((s) => s.selectedAdminTenantId);
  const myRole = useRunnerStore((s) => s.role);
  const startImpersonation = useRunnerStore((s) => s.startImpersonation);

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

  // Load available companies for the Reassign dropdown
  useEffect(() => {
    async function loadTenants() {
      try {
        if (myRole === 'super_admin') {
          const data = await adminGet<{ tenants: TenantOption[] }>('/admin/tenants?limit=100');
          setTenantOptions(data.tenants);
        } else {
          const data = await adminGet<{ tenant: TenantOption }>('/admin/tenants/me');
          if (data.tenant) setTenantOptions([data.tenant]);
        }
      } catch { /* silently fail */ }
    }
    if (myRole === 'admin' || myRole === 'super_admin') loadTenants();
  }, [myRole]);

  async function handleMove(row: UserRow, tenantId: string) {
    const tname = tenantOptions.find((t) => t.id === tenantId)?.name ?? tenantId;
    if (!confirm(`Move ${row.email} to "${tname}"?`)) return;
    try {
      await adminPut(`/admin/users/${row.id}/company`, { tenantId });
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Reassign failed.');
    }
  }

  async function handleImpersonate(row: UserRow) {
    if (!confirm(`Impersonate ${row.email}?`)) return;
    try {
      const result = await adminPost<{ user: { email: string } }>(
        `/admin/users/${row.id}/impersonate`,
        {},
      );
      startImpersonation(result.user.email);
      window.location.href = '/';
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Impersonation failed');
    }
  }

  async function handleDelete(row: UserRow) {
    if (!confirm(`Delete user ${row.email}? This cannot be undone.`)) return;
    try {
      await adminDelete(`/admin/users/${row.id}`);
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  const columns = [
    {
      key: 'email',
      header: 'Email',
      render: (row: UserRow) => (
        <span className="text-sm text-gray-800 truncate max-w-[220px] block">{row.email}</span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (row: UserRow) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
            row.role === 'super_admin'
              ? 'bg-red-100 text-red-800'
              : row.role === 'admin'
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
      key: 'tenantName',
      header: 'Company',
      render: (row: UserRow) =>
        row.tenantName
          ? <span className="text-sm text-gray-700 whitespace-nowrap">{row.tenantName}</span>
          : <span className="text-xs text-gray-400 italic">&mdash;</span>,
    },
    {
      key: 'pbxNames',
      header: 'PBX',
      render: (row: UserRow) =>
        row.pbxNames.length > 0
          ? <span className="text-xs text-gray-600 whitespace-nowrap">{row.pbxNames.join(', ')}</span>
          : <span className="text-xs text-gray-400 italic">&mdash;</span>,
    },
    {
      key: 'emailVerified',
      header: 'Verified',
      render: (row: UserRow) => (
        <span className={`text-xs ${row.emailVerified ? 'text-green-600' : 'text-gray-400'}`}>
          {row.emailVerified ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row: UserRow) => (
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
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
          <option value="super_admin">Super Admin</option>
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
            actions={(row) => (
              <UserActionsMenu
                row={row}
                myRole={myRole}
                tenantOptions={tenantOptions}
                onChangeRole={() => setEditingUser(row)}
                onMove={(tid) => handleMove(row, tid)}
                onImpersonate={() => handleImpersonate(row)}
                onDelete={() => handleDelete(row)}
              />
            )}
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
