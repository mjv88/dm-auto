'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { adminGet, adminPost } from '@/lib/adminApi';
import { useRunnerStore } from '@/lib/store';

interface SystemStats {
  server: {
    cpuCount: number;
    loadAvg: { '1m': number; '5m': number; '15m': number };
    memory:  { totalBytes: number; freeBytes: number; usedBytes: number };
    disk:    { totalBytes: number; freeBytes: number; usedBytes: number };
    uptimeSeconds: number;
  };
  database: {
    sizeBytes:   number;
    connections: number;
    tables: Array<{ name: string; liveRows: number; deadRows: number; totalSize: string }>;
  };
}

function fmt(bytes: number) {
  if (bytes === 0) return '—';
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(0)} MB`;
}

function pct(used: number, total: number) {
  if (!total) return 0;
  return Math.round((used / total) * 100);
}

function uptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
}

function Bar({ value, warn = 70, danger = 90 }: { value: number; warn?: number; danger?: number }) {
  const colour = value >= danger ? 'bg-red-500' : value >= warn ? 'bg-amber-400' : 'bg-green-500';
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 mt-1">
      <div className={`${colour} h-2 rounded-full transition-all`} style={{ width: `${value}%` }} />
    </div>
  );
}

export default function SystemPage() {
  const role   = useRunnerStore((s) => s.role);
  const router = useRouter();

  const [data,         setData]         = useState<SystemStats | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [vacuuming,    setVacuuming]    = useState(false);
  const [pruning,      setPruning]      = useState(false);
  const [pruneResult,  setPruneResult]  = useState<{ message: string; output?: string; dashboardUrl?: string } | null>(null);
  const [msg,          setMsg]          = useState('');

  useEffect(() => {
    if (role !== 'super_admin') router.replace('/admin');
  }, [role, router]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminGet<SystemStats>('/admin/system');
      setData(result);
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleVacuum() {
    if (!confirm('Run VACUUM ANALYZE? This may take a moment on large tables.')) return;
    setVacuuming(true);
    setMsg('');
    try {
      const r = await adminPost<{ message: string }>('/admin/system/vacuum', {});
      setMsg(r.message);
      refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Vacuum failed.');
    } finally { setVacuuming(false); }
  }

  async function handleDockerPrune() {
    if (!confirm('Trigger Docker cleanup? Stopped containers and unused images will be removed.')) return;
    setPruning(true);
    setPruneResult(null);
    try {
      const r = await adminPost<{ message: string; output?: string; dashboardUrl?: string }>('/admin/system/docker-prune', {});
      setPruneResult(r);
    } catch (err) {
      setPruneResult({ message: err instanceof Error ? err.message : 'Docker prune failed.' });
    } finally { setPruning(false); }
  }

  if (role !== 'super_admin') return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">System</h2>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="text-sm text-blue-600 hover:underline disabled:opacity-40"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {msg && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{msg}</p>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Server */}
          <div className="bg-white border rounded-lg p-5 space-y-4">
            <h3 className="font-medium text-gray-900">Server</h3>

            <div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>CPU load (1m / 5m / 15m)</span>
                <span className="font-mono">{data.server.loadAvg['1m'].toFixed(2)} / {data.server.loadAvg['5m'].toFixed(2)} / {data.server.loadAvg['15m'].toFixed(2)}</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{data.server.cpuCount} vCPU — load &gt; {data.server.cpuCount} = saturated</p>
            </div>

            <div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Memory</span>
                <span>{fmt(data.server.memory.usedBytes)} / {fmt(data.server.memory.totalBytes)} ({pct(data.server.memory.usedBytes, data.server.memory.totalBytes)}%)</span>
              </div>
              <Bar value={pct(data.server.memory.usedBytes, data.server.memory.totalBytes)} />
            </div>

            {data.server.disk.totalBytes > 0 && (
              <div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Disk</span>
                  <span>{fmt(data.server.disk.usedBytes)} / {fmt(data.server.disk.totalBytes)} ({pct(data.server.disk.usedBytes, data.server.disk.totalBytes)}%)</span>
                </div>
                <Bar value={pct(data.server.disk.usedBytes, data.server.disk.totalBytes)} warn={75} danger={90} />
              </div>
            )}

            <div className="text-sm text-gray-500">Uptime: {uptime(data.server.uptimeSeconds)}</div>

            <div className="pt-2 border-t">
              <button
                type="button"
                onClick={handleDockerPrune}
                disabled={pruning}
                className="px-3 py-1.5 text-sm bg-gray-800 text-white rounded hover:bg-gray-900 disabled:opacity-40"
              >
                {pruning ? 'Pruning…' : 'Docker Prune'}
              </button>
              {pruneResult && (
                <div className="mt-2">
                  <p className="text-xs text-gray-600">{pruneResult.message}</p>
                  {pruneResult.output && (
                    <pre className="mt-1 text-xs bg-gray-900 text-green-400 rounded p-2 max-h-32 overflow-y-auto whitespace-pre-wrap">{pruneResult.output}</pre>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Database */}
          <div className="bg-white border rounded-lg p-5 space-y-4">
            <h3 className="font-medium text-gray-900">Database</h3>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded p-3">
                <p className="text-gray-500 text-xs">DB Size</p>
                <p className="font-medium text-gray-900">{fmt(data.database.sizeBytes)}</p>
              </div>
              <div className="bg-gray-50 rounded p-3">
                <p className="text-gray-500 text-xs">Connections</p>
                <p className="font-medium text-gray-900">{data.database.connections}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Tables</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {data.database.tables.map(t => (
                  <div key={t.name} className="flex items-center justify-between text-xs py-1 border-b border-gray-50 last:border-0">
                    <span className="text-gray-700 font-mono">{t.name}</span>
                    <div className="flex gap-3 text-gray-500">
                      <span>{t.liveRows.toLocaleString()} rows</span>
                      {t.deadRows > 0 && <span className="text-amber-600">{t.deadRows.toLocaleString()} dead</span>}
                      <span>{t.totalSize}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t">
              <button
                type="button"
                onClick={handleVacuum}
                disabled={vacuuming}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
              >
                {vacuuming ? 'Running…' : 'VACUUM ANALYZE'}
              </button>
              <p className="text-xs text-gray-400 mt-1">Reclaims dead tuples, updates query planner stats.</p>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
