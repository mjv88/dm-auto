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
  topRunners: { entraEmail: string; pbxName?: string; count: number }[];
  topDepartments: { toDeptName: string; pbxName?: string; count: number }[];
  hourlyActivity: { hour: string; count: number }[];
}

interface RecentAuditEntry {
  id: string;
  createdAt: string;
  entraEmail: string;
  fromDeptName: string | null;
  toDeptName: string | null;
  status: string;
}

interface RecentAuditResponse {
  logs: RecentAuditEntry[];
  total: number;
  page: number;
  pages: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentSwitches, setRecentSwitches] = useState<RecentAuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminGet<AdminStats>('/admin/stats')
      .then((data) => {
        // Normalize hourlyActivity: date_trunc returns ISO timestamps, extract hour number
        if (data.hourlyActivity) {
          data.hourlyActivity = data.hourlyActivity.map((h) => {
            const d = new Date(h.hour);
            return { hour: isNaN(d.getTime()) ? h.hour : String(d.getHours()), count: h.count };
          });
        }
        setStats(data);
      })
      .catch((err) => setError(err.message));

    // Fetch last 5 audit entries for Recent Switches
    adminGet<RecentAuditResponse>('/admin/audit?limit=5&page=1')
      .then((data) => setRecentSwitches(data.logs ?? []))
      .catch(() => { /* silently fail */ });
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
              {(stats.topRunners ?? []).map((r, i) => (
                <tr key={r.entraEmail ?? i} className="border-b last:border-b-0">
                  <td className="px-4 py-2 text-gray-700 truncate max-w-[200px]">{r.entraEmail}</td>
                  <td className="px-4 py-2 text-right text-gray-500 whitespace-nowrap">{r.count} switches</td>
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
              {(stats.topDepartments ?? []).map((d, i) => (
                <tr key={d.toDeptName ?? i} className="border-b last:border-b-0">
                  <td className="px-4 py-2 text-gray-700">{d.toDeptName || '—'}</td>
                  <td className="px-4 py-2 text-right text-gray-500 whitespace-nowrap">{d.count} switches</td>
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

      {/* Recent Switches */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <h3 className="text-sm font-semibold text-gray-700 px-4 py-3 border-b bg-gray-50">
          Recent Switches
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50/50">
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Time</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Email</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">From &rarr; To</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {recentSwitches.map((entry) => (
              <tr key={entry.id} className="border-b last:border-b-0">
                <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                  {new Date(entry.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-xs text-gray-700 truncate max-w-[200px]">
                  {entry.entraEmail}
                </td>
                <td className="px-4 py-2 text-xs text-gray-600">
                  {entry.fromDeptName || '—'} &rarr; {entry.toDeptName || '—'}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      entry.status === 'success'
                        ? 'bg-green-100 text-green-700'
                        : entry.status === 'denied'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {entry.status}
                  </span>
                </td>
              </tr>
            ))}
            {recentSwitches.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-gray-400 text-sm">
                  No recent switches
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Activity chart */}
      <ActivityChart data={stats.hourlyActivity ?? []} />
    </div>
  );
}
