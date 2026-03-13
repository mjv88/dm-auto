import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', async (_request, reply) => {
    let dbStatus: 'connected' | 'disconnected' = 'connected';
    try {
      const db = getDb();
      await Promise.race([
        db.execute(sql`SELECT 1`),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('DB health check timed out')), 1000),
        ),
      ]);
    } catch {
      dbStatus = 'disconnected';
    }

    return reply.send({
      status:  dbStatus === 'connected' ? 'ok' : 'degraded',
      version: process.env['npm_package_version'] ?? '1.0.0',
      db:      dbStatus,
      uptime:  Math.floor(process.uptime()),
    });
  });
}
