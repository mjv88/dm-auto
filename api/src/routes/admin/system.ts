/**
 * src/routes/admin/system.ts
 *
 * Super-admin only system monitoring and management.
 *
 * GET  /admin/system          — server stats, DB stats
 * POST /admin/system/vacuum   — VACUUM ANALYZE all user tables
 * POST /admin/system/docker-prune — trigger Coolify docker cleanup
 */

import type { FastifyInstance } from 'fastify';
import os from 'node:os';
import { statfs } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { requireAuth, requireRole } from '../../middleware/requireAuth.js';
import { config } from '../../config.js';

export async function adminSystemRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  // ── GET /admin/system ──────────────────────────────────────────────────────

  fastify.get('/admin/system', { preHandler: [requireRole('super_admin')] }, async (_request, reply) => {
    const db = getDb();

    // ── Server stats (Node.js os module) ──────────────────────────────────────
    const totalMem  = os.totalmem();
    const freeMem   = os.freemem();
    const loadAvg   = os.loadavg();        // [1m, 5m, 15m]
    const cpuCount  = os.cpus().length;
    const uptime    = os.uptime();         // seconds

    // Disk (root filesystem)
    let diskTotal = 0;
    let diskFree  = 0;
    try {
      const stat = await statfs('/');
      diskTotal = stat.blocks  * stat.bsize;
      diskFree  = stat.bavail  * stat.bsize;
    } catch {
      // Non-fatal — may not be available in all container environments
    }

    // ── DB stats ──────────────────────────────────────────────────────────────
    let dbSizeBytes   = 0;
    let connections   = 0;
    let tableStats: Array<{ name: string; liveRows: number; deadRows: number; totalSize: string }> = [];

    try {
      const sizeResult = await db.execute(
        sql`SELECT pg_database_size(current_database())::bigint AS size`,
      );
      dbSizeBytes = Number((sizeResult as unknown as Array<{ size: string }>)[0]?.size ?? 0);

      const connResult = await db.execute(
        sql`SELECT count(*)::int AS count FROM pg_stat_activity WHERE state IS NOT NULL`,
      );
      connections = Number((connResult as unknown as Array<{ count: string }>)[0]?.count ?? 0);

      const tableResult = await db.execute(sql`
        SELECT
          relname::text                                  AS table_name,
          n_live_tup::bigint                             AS live_rows,
          n_dead_tup::bigint                             AS dead_rows,
          pg_size_pretty(pg_total_relation_size(relid))  AS total_size
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC
      `);
      tableStats = (tableResult as unknown as Array<{
        table_name: string; live_rows: string; dead_rows: string; total_size: string;
      }>).map(t => ({
        name:      t.table_name,
        liveRows:  Number(t.live_rows),
        deadRows:  Number(t.dead_rows),
        totalSize: t.total_size,
      }));
    } catch (err) {
      fastify.log.warn({ err }, 'DB stats query failed');
    }

    return reply.send({
      server: {
        cpuCount,
        loadAvg: { '1m': loadAvg[0], '5m': loadAvg[1], '15m': loadAvg[2] },
        memory:  { totalBytes: totalMem, freeBytes: freeMem, usedBytes: totalMem - freeMem },
        disk:    { totalBytes: diskTotal, freeBytes: diskFree, usedBytes: diskTotal - diskFree },
        uptimeSeconds: uptime,
      },
      database: {
        sizeBytes: dbSizeBytes,
        connections,
        tables: tableStats,
      },
    });
  });

  // ── POST /admin/system/vacuum ──────────────────────────────────────────────

  fastify.post('/admin/system/vacuum', { preHandler: [requireRole('super_admin')] }, async (_request, reply) => {
    const db = getDb();
    // VACUUM ANALYZE reclaims dead tuples and updates query planner stats
    await db.execute(sql`VACUUM ANALYZE`);
    return reply.send({ message: 'VACUUM ANALYZE completed.' });
  });

  // ── POST /admin/system/docker-prune ───────────────────────────────────────

  fastify.post('/admin/system/docker-prune', { preHandler: [requireRole('super_admin')] }, async (_request, reply) => {
    const { COOLIFY_URL, COOLIFY_API_TOKEN } = config;

    if (!COOLIFY_URL || !COOLIFY_API_TOKEN) {
      return reply.code(501).send({
        error: 'NOT_CONFIGURED',
        message: 'COOLIFY_URL and COOLIFY_API_TOKEN env vars are not set.',
        dashboardUrl: null,
      });
    }

    // Discover server UUID from Coolify API
    try {
      const serversResp = await fetch(`${COOLIFY_URL}/api/v1/servers`, {
        headers: { Authorization: `Bearer ${COOLIFY_API_TOKEN}` },
      });
      const servers = await serversResp.json() as Array<{ uuid: string; name: string }>;
      const server  = servers[0]; // first (and only) server

      if (!server) throw new Error('No servers found');

      // Trigger docker cleanup — Coolify v4 endpoint
      const cleanupResp = await fetch(
        `${COOLIFY_URL}/api/v1/servers/${server.uuid}/docker/cleanup`,
        { method: 'POST', headers: { Authorization: `Bearer ${COOLIFY_API_TOKEN}` } },
      );

      if (cleanupResp.ok) {
        return reply.send({ message: 'Docker cleanup triggered.' });
      }

      // Endpoint not supported — return dashboard URL for manual trigger
      const dashboardUrl = `${COOLIFY_URL}/server/${server.uuid}/docker-cleanup`;
      return reply.code(202).send({
        message: 'Docker cleanup API not available. Use the dashboard.',
        dashboardUrl,
      });
    } catch (err) {
      fastify.log.warn({ err }, 'Docker prune via Coolify API failed');
      return reply.code(502).send({
        error: 'COOLIFY_UNAVAILABLE',
        message: 'Could not reach Coolify.',
        dashboardUrl: `${COOLIFY_URL}/servers`,
      });
    }
  });
}
