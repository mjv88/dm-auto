/**
 * src/utils/validate.ts
 *
 * Central home for Zod request-body schemas.
 */

import { z } from 'zod';

// ── FQDN validation ────────────────────────────────────────────────────────────

const FQDN_REGEX = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(:\d{1,5})?$/;

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

// ── Setup wizard schemas ─────────────────────────────────────────────────────

export const setupCompanySchema = z.object({
  name: z.string().min(1).max(255),
});

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
