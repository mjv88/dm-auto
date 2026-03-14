import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export async function registerRateLimit(fastify: FastifyInstance): Promise<void> {
  await fastify.register(import('@fastify/rate-limit'), {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    keyGenerator: (req) => req.runnerContext?.extensionNumber ?? req.ip,
    errorResponseBuilder: (_req, _context) => ({
      statusCode: 429,
      error: 'RATE_LIMITED',
      message: 'Too many requests. Try again later.',
    }),
    // Only apply strict rate limiting to runner switch endpoints
    // Admin, setup, and auth endpoints have their own per-route limits
    allowList: (req) => {
      const url = req.url ?? '';
      // Exempt admin, setup, auth, health, and company endpoints from global rate limit
      if (
        url.startsWith('/admin/') ||
        url.startsWith('/setup/') ||
        url.startsWith('/auth/') ||
        url.startsWith('/company/') ||
        url === '/health'
      ) {
        return true;
      }
      return false;
    },
  });
}
