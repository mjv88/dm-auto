import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export async function registerRateLimit(fastify: FastifyInstance): Promise<void> {
  await fastify.register(import('@fastify/rate-limit'), {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    keyGenerator: (req) => req.runnerContext?.extensionNumber ?? req.ip,
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: 'RATE_LIMITED',
      message: 'Too many department switches. Try again later.',
    }),
  });
}
