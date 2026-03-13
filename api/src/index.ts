import Fastify from 'fastify';
import * as Sentry from '@sentry/node';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { runMigrations } from './db/migrate.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { switchRoutes } from './routes/switch.js';
import { departmentRoutes } from './routes/departments.js';
import { adminTenantRoutes } from './routes/admin/tenants.js';
import { adminPbxRoutes } from './routes/admin/pbx.js';
import { adminRunnerRoutes } from './routes/admin/runners.js';
import { registerRateLimit } from './middleware/rateLimit.js';
import { registerSecurity } from './middleware/security.js';
import { RunnerError } from './utils/errors.js';

// Initialise Sentry before anything else (no-op if DSN is absent)
if (config.SENTRY_DSN) {
  Sentry.init({ dsn: config.SENTRY_DSN });
}

async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: config.LOG_LEVEL,
    },
  });

  // Security headers + CORS (registered first so every response is covered)
  await registerSecurity(fastify);

  // Rate limiting (must be registered before routes)
  await registerRateLimit(fastify);

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(authRoutes);
  await fastify.register(switchRoutes);
  await fastify.register(departmentRoutes);
  await fastify.register(adminTenantRoutes);
  await fastify.register(adminPbxRoutes);
  await fastify.register(adminRunnerRoutes);

  // Global error handler — maps RunnerError codes → HTTP responses
  fastify.setErrorHandler((error, _request, reply) => {
    if (config.SENTRY_DSN) {
      Sentry.captureException(error);
    }
    if (error instanceof RunnerError) {
      return reply.code(error.statusCode).send({
        error:   error.code,
        message: error.message,
      });
    }
    fastify.log.error(error);
    return reply.code(500).send({
      error:   'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  });

  return fastify;
}

async function main() {
  try {
    // Run DB migrations before accepting traffic
    await runMigrations();

    const server = await buildServer();
    await server.listen({ port: config.PORT, host: '0.0.0.0' });
    logger.info(`Server running on port ${config.PORT}`);
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}

main();
