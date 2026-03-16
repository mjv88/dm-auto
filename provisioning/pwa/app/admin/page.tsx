'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { adminGet } from '@/lib/adminApi';
import SummaryCard from '@/components/admin/SummaryCard';
import { useProvisioningStore } from '@/lib/store';

interface Stats {
  total: number;
  provisioned: number;
  pending: number;
  errors: number;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const selectedAdminTenantId = useProvisioningStore((s) => s.selectedAdminTenantId);

  useEffect(() => {
    setLoading(true);
    adminGet<Stats>('/admin/stats')
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [selectedAdminTenantId]);

  if (loading) {
    return (
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
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Dashboard</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Extensions"
          value={stats?.total ?? 0}
          href="/admin/extensions"
        />
        <SummaryCard
          title="Provisioned"
          value={stats?.provisioned ?? 0}
          subtitle="Fetched + Delivered"
        />
        <SummaryCard
          title="Pending"
          value={stats?.pending ?? 0}
          href="/admin/extensions?status=pending"
        />
        <SummaryCard
          title="Errors"
          value={stats?.errors ?? 0}
          highlight={!!stats && stats.errors > 0}
          href="/admin/extensions?status=error"
        />
      </div>
    </div>
  );
}
