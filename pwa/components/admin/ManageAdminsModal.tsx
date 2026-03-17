'use client';

import { useEffect, useState } from 'react';
import { adminGet, adminPost } from '@/lib/adminApi';

interface AdminUser {
  id: string;
  email: string;
  role: string;
  tenantId: string | null;
}

interface TenantOption {
  id: string;
  name: string;
}

interface Props {
  tenantId: string;
  tenantName: string;
  onClose: () => void;
}

export default function ManageAdminsModal({ tenantId, tenantName, onClose }: Props) {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [allTenants, setAllTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [reassigning, setReassigning] = useState<string | null>(null); // userId being reassigned
  const [targetTenantId, setTargetTenantId] = useState<Record<string, string>>({}); // userId → selected target
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [adminsData, tenantsData] = await Promise.all([
          adminGet<{ admins: AdminUser[] }>(`/admin/tenants/${tenantId}/admins`),
          adminGet<{ tenants: TenantOption[] }>('/admin/tenants?limit=100'),
        ]);
        setAdmins(adminsData.admins);
        setAllTenants(tenantsData.tenants.filter(t => t.id !== tenantId));
      } catch {
        setError('Failed to load admins.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tenantId]);

  async function handleReassign(userId: string, userEmail: string) {
    const target = targetTenantId[userId];
    if (!target) return;
    const targetName = allTenants.find(t => t.id === target)?.name ?? target;
    if (!confirm(`Move ${userEmail} from "${tenantName}" to "${targetName}"?`)) return;

    setReassigning(userId);
    setError('');
    try {
      await adminPost(`/admin/tenants/${tenantId}/admins/reassign`, {
        userId,
        targetTenantId: target,
      });
      // Remove from local list
      setAdmins(prev => prev.filter(a => a.id !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reassign failed.');
    } finally {
      setReassigning(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Admins — {tenantName}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <svg className="animate-spin h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
        ) : admins.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">No admins registered for this company yet.</p>
        ) : (
          <div className="space-y-3">
            {admins.map(admin => (
              <div key={admin.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-md">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{admin.email}</p>
                  <p className="text-xs text-gray-500">{admin.role}</p>
                </div>
                <select
                  value={targetTenantId[admin.id] ?? ''}
                  onChange={e => setTargetTenantId(prev => ({ ...prev, [admin.id]: e.target.value }))}
                  className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Move to…</option>
                  {allTenants.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!targetTenantId[admin.id] || reassigning === admin.id}
                  onClick={() => handleReassign(admin.id, admin.email)}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40"
                >
                  {reassigning === admin.id ? '…' : 'Move'}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
