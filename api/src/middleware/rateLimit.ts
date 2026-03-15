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
    // Only rate-limit POST /runner/switch — everything else is exempt
    allowList: (req) => {
      const url = req.url ?? '';
      const method = req.method ?? '';
      // Only apply rate limit to the department switch endpoint
      if (method === 'POST' && url.startsWith('/runner/switch')) {
        return false; // NOT exempt — rate limit applies
      }
      return true; // exempt from rate limit
    },
  });
}
