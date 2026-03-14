'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { adminGet } from '@/lib/adminApi';
import SummaryCard from '@/components/admin/SummaryCard';
import ActivityChart from '@/components/admin/ActivityChart';

interface AdminStats {
  pbx: { total: number; active: number };
  runners: { total: number; active: number };
  switchesToday: number;
  failedToday?: number;
  topRunners: { email: string; pbxName?: string; count: number }[];
  topDepartments: { deptName: string; pbxName?: string; count: number }[];
  hourlyActivity: { hour: string; count: number }[];
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
        <SummaryCard title="PBX Systems" value={`${stats.pbx?.active ?? 0} / ${stats.pbx?.total ?? 0}`} href="/admin/pbx" />
        <SummaryCard title="Runners" value={`${stats.runners?.active ?? 0} / ${stats.runners?.total ?? 0}`} href="/admin/runners" />
        <SummaryCard title="Switches Today" value={stats.switchesToday ?? 0} href="/admin/audit" />
        <SummaryCard
          title="Failed Today"
          value={stats.failedToday ?? 0}
          href="/admin/audit"
          highlight={(stats.failedToday ?? 0) > 0}
        />
      </div>

      {/* Top tables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <h3 className="text-sm font-semibold text-gray-700 px-4 py-3 border-b bg-gray-50">
            Top Runners (7d)
          </h3>
          <table className="w-full text-sm">
            <tbody>
              {(stats.topRunners ?? []).map((r) => (
                <tr key={r.email} className="border-b last:border-b-0">
                  <td className="px-4 py-2 text-gray-700">{r.email}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{r.count} switches</td>
                </tr>
              ))}
              {(stats.topRunners ?? []).length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-4 text-center text-gray-400">
                    No activity
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <h3 className="text-sm font-semibold text-gray-700 px-4 py-3 border-b bg-gray-50">
            Top Departments (7d)
          </h3>
          <table className="w-full text-sm">
            <tbody>
              {(stats.topDepartments ?? []).map((d) => (
                <tr key={d.deptName} className="border-b last:border-b-0">
                  <td className="px-4 py-2 text-gray-700">{d.deptName}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{d.count} switches</td>
                </tr>
              ))}
              {(stats.topDepartments ?? []).length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-4 text-center text-gray-400">
                    No activity
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Activity chart */}
      <ActivityChart data={stats.hourlyActivity ?? []} />
    </div>
  );
}
