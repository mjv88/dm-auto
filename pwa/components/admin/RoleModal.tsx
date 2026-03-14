'use client';

import { useState, useEffect } from 'react';
import { adminPut, adminGet } from '@/lib/adminApi';

interface Tenant {
  id: string;
  name: string;
}

interface RoleModalProps {
  userId: string;
  currentRole: string;
  userName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RoleModal({ userId, currentRole, userName, onClose, onSuccess }: RoleModalProps) {
  const [role, setRole] = useState<'manager' | 'runner'>(currentRole === 'manager' ? 'manager' : 'runner');
  const [tenantIds, setTenantIds] = useState<string[]>([]);
  const [availableTenants, setAvailableTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTenants() {
      try {
        const data = await adminGet<{ tenant?: Tenant; tenants?: Tenant[] }>('/admin/tenants/me');
        if (data.tenants && Array.isArray(data.tenants)) {
          setAvailableTenants(data.tenants);
        } else if (data.tenant) {
          setAvailableTenants([data.tenant]);
        }
      } catch {
        // Ignore — tenants list will be empty
      }
    }
    fetchTenants();

    // Load current managed companies for the user
    async function fetchUserDetail() {
      try {
        const data = await adminGet<{ managedCompanies?: Array<{ tenantId: string }> }>(`/admin/users/${userId}`);
        if (data.managedCompanies) {
          setTenantIds(data.managedCompanies.map(c => c.tenantId));
        }
      } catch {
        // Ignore
      }
    }
    fetchUserDetail();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await adminPut(`/admin/users/${userId}/role`, {
        role,
        ...(role === 'manager' ? { tenantIds } : {}),
      });
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function toggleTenant(tenantId: string) {
    setTenantIds((prev) =>
      prev.includes(tenantId) ? prev.filter((id) => id !== tenantId) : [...prev, tenantId],
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Change Role: {userName}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'manager' | 'runner')}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="runner">Runner</option>
              <option value="manager">Manager</option>
            </select>
          </div>

          {role === 'manager' && availableTenants.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Managed Companies</label>
              <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
                {availableTenants.map((tenant) => (
                  <label key={tenant.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tenantIds.includes(tenant.id)}
                      onChange={() => toggleTenant(tenant.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-gray-700">{tenant.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
