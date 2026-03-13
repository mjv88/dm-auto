'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { adminGet } from '@/lib/adminApi';
import SummaryCard from '@/components/admin/SummaryCard';
import ActivityChart from '@/components/admin/ActivityChart';

interface AdminStats {
  total_runners: number;
  active_runners: number;
  total_pbx: number;
  failed_logins_24h: number;
  top_runners: { email: string; login_count: number }[];
  top_departments: { name: string; runner_count: number }[];
  activity_by_hour: { hour: string; count: number }[];
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminGet<AdminStats>('/admin/stats')
      .then(setStats)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return <p className="text-sm text-red-500 py-8 text-center">{error}</p>;
  }

  if (!stats) {
    return <p className="text-sm text-gray-400 py-8 text-center">Loading dashboard...</p>;
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard title="Total Runners" value={stats.total_runners} href="/admin/runners" />
        <SummaryCard title="Active Runners" value={stats.active_runners} href="/admin/runners" />
        <SummaryCard title="PBX Systems" value={stats.total_pbx} href="/admin/pbx" />
        <SummaryCard
          title="Failed Logins (24h)"
          value={stats.failed_logins_24h}
          href="/admin/audit"
          highlight={stats.failed_logins_24h > 0}
        />
      </div>

      {/* Top tables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <h3 className="text-sm font-semibold text-gray-700 px-4 py-3 border-b bg-gray-50">
            Top Runners
          </h3>
          <table className="w-full text-sm">
            <tbody>
              {stats.top_runners.map((r) => (
                <tr key={r.email} className="border-b last:border-b-0">
                  <td className="px-4 py-2 text-gray-700">{r.email}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{r.login_count} logins</td>
                </tr>
              ))}
              {stats.top_runners.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-4 text-center text-gray-400">
                    No data
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <h3 className="text-sm font-semibold text-gray-700 px-4 py-3 border-b bg-gray-50">
            Top Departments
          </h3>
          <table className="w-full text-sm">
            <tbody>
              {stats.top_departments.map((d) => (
                <tr key={d.name} className="border-b last:border-b-0">
                  <td className="px-4 py-2 text-gray-700">{d.name}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{d.runner_count} runners</td>
                </tr>
              ))}
              {stats.top_departments.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-4 text-center text-gray-400">
                    No data
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Activity chart */}
      <ActivityChart data={stats.activity_by_hour} />
    </div>
  );
}
