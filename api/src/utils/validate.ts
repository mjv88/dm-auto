/**
 * src/utils/validate.ts
 *
 * Central home for:
 *   1. validateFqdn — regex pre-check + pbx_credentials whitelist check
 *   2. All Zod request-body schemas (§5 of the spec)
 *
 * Every route that accepts user input imports its schema from here so the
 * validation rules are defined in exactly one place.
 */

import { eq } from 'drizzle-orm';
import { z } from 'zod';

// ── FQDN validation ────────────────────────────────────────────────────────────

/** Pre-compiled regex — must start with alphanumeric, no leading/trailing dots. */
const FQDN_REGEX = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(:\d{1,5})?$/;

/**
 * Validates a PBX FQDN in two stages:
 *   1. Regex pre-check: fast, no I/O, rejects obviously malformed input.
 *   2. Whitelist check: confirms the FQDN is an active row in pbx_credentials.
 *
 * An unregistered FQDN always returns false — no network call is ever made
 * to an unrecognised host.
 */
export async function validateFqdn(fqdn: string): Promise<boolean> {
  if (!FQDN_REGEX.test(fqdn)) return false;

  const { getDb, schema } = await import('../db/index.js');
  const db = getDb();

  const rows = await db
    .select({ pbxFqdn: schema.pbxCredentials.pbxFqdn })
    .from(schema.pbxCredentials)
    .where(eq(schema.pbxCredentials.isActive, true));

  return rows.some((r) => r.pbxFqdn === fqdn);
}

// ── Runner-facing route schemas ────────────────────────────────────────────────

/** POST /runner/auth */
export const authBodySchema = z.object({
  idToken: z.string().min(100).max(5000),
  pbxFqdn: z
    .string()
    .regex(FQDN_REGEX, 'Invalid FQDN format')
    .optional(),
});

/** POST /runner/switch */
export const switchBodySchema = z.object({
  targetDeptId: z.number().int().positive().max(999999),
});

// ── Admin PBX schemas ──────────────────────────────────────────────────────────

/** POST /admin/pbx */
export const createPbxSchema = z.object({
  fqdn: z.string().regex(FQDN_REGEX, 'Invalid FQDN format'),
  name: z.string().min(1).max(255),
  authMode: z.enum(['xapi', 'user_credentials']),
  credentials: z.union([
    z.object({
      mode:     z.literal('xapi'),
      clientId: z.string().min(1),
      secret:   z.string().min(1),
    }),
    z.object({
      mode:     z.literal('user_credentials'),
      username: z.string().min(1),
      password: z.string().min(1),
    }),
  ]),
});

/** PUT /admin/pbx/:id */
export const updatePbxSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  credentials: z
    .union([
      z.object({
        mode:     z.literal('xapi'),
        clientId: z.string().min(1),
        secret:   z.string().min(1),
      }),
      z.object({
        mode:     z.literal('user_credentials'),
        username: z.string().min(1),
        password: z.string().min(1),
      }),
    ])
    .optional(),
  isActive: z.boolean().optional(),
});

// ── Admin runner schemas ───────────────────────────────────────────────────────

/** Shared: valid caller ID — optional + prefix then 1–20 digits */
const callerIdSchema = z.string().regex(/^\+?\d{1,20}$/, 'Caller ID must be digits, optionally prefixed with +');

/** POST /admin/runners */
export const createRunnerSchema = z.object({
  email:            z.string().email(),
  extension:        z.string().min(1).max(20).regex(/^\d+$/, 'Extension must be numeric'),
  pbxId:            z.string().uuid(),
  allowedDeptIds:   z.array(z.string()).default([]),
  outboundCallerId: callerIdSchema.nullable().optional(),
  deptCallerIds:    z.record(z.string(), callerIdSchema).optional(),
});

/** PUT /admin/runners/:id */
export const updateRunnerSchema = z.object({
  email:            z.string().email().optional(),
  extension:        z.string().min(1).max(20).regex(/^\d+$/, 'Extension must be numeric').optional(),
  allowedDeptIds:   z.array(z.string()).optional(),
  isActive:         z.boolean().optional(),
  outboundCallerId: callerIdSchema.nullable().optional(),
  deptCallerIds:    z.record(z.string(), callerIdSchema).optional(),
});

// ── Admin tenant schemas ───────────────────────────────────────────────────────

/** PUT /admin/tenants/me */
export const updateTenantSchema = z.object({
  name:          z.string().min(1).max(255).optional(),
  entraGroupId:  z.string().uuid().optional(),
  entraTenantId: z.string().uuid('Must be a valid UUID').optional(),
});

/** POST /admin/tenants (super_admin creates a company) */
export const createTenantSchema = z.object({
  name:          z.string().min(1).max(255),
  adminEmails:   z
    .array(z.string().email('Each entry must be a valid email'))
    .min(1, 'At least one admin email is required'),
  entraTenantId: z.string().uuid('Must be a valid UUID').optional(),
});

// ── Setup wizard schemas ─────────────────────────────────────────────────────

export const setupCompanySchema = z.object({ name: z.string().min(1).max(255) });
export const setupRunnersSchema = z.object({ extensionNumbers: z.array(z.string().min(1)).min(1).max(500) });
export const setupInviteSchema = z.object({ mode: z.enum(['email', 'link']) });

// ── Email/password auth schemas ──────────────────────────────────────────────

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  company: z.string().uuid().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: passwordSchema,
});

// ── User management schemas ─────────────────────────────────────────────────

export const changeRoleSchema = z.object({
  role: z.enum(['super_admin', 'admin', 'manager', 'runner']),
  tenantIds: z.array(z.string().uuid()).optional(),
});
