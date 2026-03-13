import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Encryption
  ENCRYPTION_KEY: z.string().min(1),

  // Microsoft Entra ID — app registration only (multi-tenant)
  // Tenant IDs and group IDs are stored per-tenant in the database
  ENTRA_CLIENT_ID: z.string().min(1),
  ENTRA_CLIENT_SECRET: z.string().min(1),
  // Legacy single-tenant vars (optional — multi-tenant uses DB)
  ENTRA_TENANT_ID: z.string().optional(),
  ENTRA_RUNNERS_GROUP_ID: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default('8h'),

  // Sentry
  SENTRY_DSN: z.string().optional(),

  // Server
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().default(10),
  RATE_LIMIT_WINDOW: z.coerce.number().default(3600000),

  // Email/password auth
  BCRYPT_ROUNDS: z.coerce.number().default(12),
  EMAIL_WORKER_URL: z.string().url().default('https://email.tcx-hub.com'),
  EMAIL_WORKER_SECRET: z.string().min(1).optional(),
  APP_URL: z.string().url().default('https://runner.tcx-hub.com'),

  // CORS — only requests from the Runner PWA are allowed
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  // TODO: Load .env in development
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const config = parseEnv();
