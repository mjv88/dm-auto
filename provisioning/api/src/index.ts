import Fastify from 'fastify';
import * as Sentry from '@sentry/node';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { runMigrations } from './db/migrate.js';
import { healthRoutes } from './routes/health.js';
import { emailAuthRoutes } from './routes/emailAuth.js';
import { setupRoutes } from './routes/setup.js';
import { adminRoutes } from './routes/admin/index.js';
import { provisionRoutes } from './routes/provision.js';
import { deviceProvisionRoutes } from './routes/device-provision.js';
import { registerRateLimit } from './middleware/rateLimit.js';
import { registerSecurity } from './middleware/security.js';
import { ProvisioningError } from './utils/errors.js';
import { startTokenRefreshService } from './xapi/auth.js';

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
  await fastify.register(emailAuthRoutes);
  await fastify.register(setupRoutes);
  await fastify.register(adminRoutes);
  await fastify.register(provisionRoutes);
  await fastify.register(deviceProvisionRoutes);

  // Global error handler
  fastify.setErrorHandler((error, _request, reply) => {
    if (config.SENTRY_DSN) {
      Sentry.captureException(error);
    }
    if (error instanceof ProvisioningError) {
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
    logger.info(`Provisioning API running on port ${config.PORT}`);

    // Start background xAPI token refresh (every 50 min)
    startTokenRefreshService();
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}

main();
