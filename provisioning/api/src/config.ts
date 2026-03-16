import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Encryption
  ENCRYPTION_KEY: z.string().min(1),

  // JWT
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default('8h'),

  // Sentry
  SENTRY_DSN: z.string().optional(),

  // Server
  PORT: z.coerce.number().default(3002),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().default(10),
  RATE_LIMIT_WINDOW: z.coerce.number().default(3600000),

  // Email/password auth
  BCRYPT_ROUNDS: z.coerce.number().default(12),
  APP_URL: z.string().url().default('https://provision.tcx-hub.com'),

  // SMTP (SendGrid)
  SMTP_HOST: z.string().default('smtp.sendgrid.net'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('noreply@tcx-hub.com'),

  // CORS — only requests from the Provisioning PWA are allowed
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const config = parseEnv();
