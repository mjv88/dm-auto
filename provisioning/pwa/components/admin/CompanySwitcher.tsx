'use client';

import { useEffect, useState } from 'react';
import { useProvisioningStore } from '@/lib/store';
import { adminGet } from '@/lib/adminApi';

interface TenantOption {
  id: string;
  name: string;
}

export default function CompanySwitcher() {
  const role = useProvisioningStore((s) => s.role);
  const selectedAdminTenantId = useProvisioningStore((s) => s.selectedAdminTenantId);
  const setSelectedAdminTenantId = useProvisioningStore((s) => s.setSelectedAdminTenantId);

  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTenants() {
      try {
        if (role === 'super_admin') {
          // Super admin sees all tenants — use admin tenants endpoint
          const data = await adminGet<{ tenant: TenantOption } | { tenants: TenantOption[] }>('/admin/tenants/me');
          if ('tenants' in data && Array.isArray(data.tenants)) {
            setTenants(data.tenants);
          } else if ('tenant' in data && data.tenant) {
            setTenants([data.tenant]);
          }
        } else {
          // Manager sees their tenant
          const data = await adminGet<{ tenant: TenantOption }>('/admin/tenants/me');
          if (data.tenant) {
            setTenants([data.tenant]);
            // Auto-select if only one
            if (!selectedAdminTenantId) {
              setSelectedAdminTenantId(data.tenant.id);
            }
          }
        }
      } catch {
        // Silently fail — tenants will be empty
      } finally {
        setLoading(false);
      }
    }
    fetchTenants();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span>Loading companies...</span>
      </div>
    );
  }

  if (tenants.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="company-switcher" className="text-sm font-medium text-gray-600">
        Company:
      </label>
      <select
        id="company-switcher"
        value={selectedAdminTenantId ?? ''}
        onChange={(e) => setSelectedAdminTenantId(e.target.value || null)}
        className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {role === 'super_admin' && <option value="">All Companies</option>}
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
