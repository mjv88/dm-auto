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
const FQDN_REGEX = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/;

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
});

// ── Admin runner schemas ───────────────────────────────────────────────────────

/** POST /admin/runners */
export const createRunnerSchema = z.object({
  email:          z.string().email(),
  extension:      z.string().min(1).max(20).regex(/^\d+$/, 'Extension must be numeric'),
  pbxId:          z.string().uuid(),
  allowedDeptIds: z.array(z.string()).default([]),
});

/** PUT /admin/runners/:id */
export const updateRunnerSchema = z.object({
  email:          z.string().email().optional(),
  extension:      z.string().min(1).max(20).regex(/^\d+$/, 'Extension must be numeric').optional(),
  allowedDeptIds: z.array(z.string()).optional(),
  isActive:       z.boolean().optional(),
});

// ── Admin tenant schemas ───────────────────────────────────────────────────────

/** PUT /admin/tenants/me */
export const updateTenantSchema = z.object({
  name:         z.string().min(1).max(255).optional(),
  entraGroupId: z.string().uuid().optional(),
});
