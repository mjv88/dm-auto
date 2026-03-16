/**
 * src/middleware/session.ts
 *
 * Issues and validates internal session JWTs signed with JWT_SECRET.
 * Simplified UnifiedSession for the Provisioning Service.
 */

import jwt from 'jsonwebtoken';

// ── Unified session type ─────────────────────────────────────────────────────

export interface UnifiedSession {
  type: 'session';
  userId: string;
  email: string;
  role: 'super_admin' | 'admin' | 'runner';
  tenantId: string | null;
  emailVerified: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return secret;
}

function getExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN ?? '8h';
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Signs a session payload and returns a JWT string.
 */
export function createSessionToken(payload: UnifiedSession): string {
  const secret = getSecret();
  const expiresIn = getExpiresIn();
  return jwt.sign(payload as unknown as Record<string, unknown>, secret, {
    expiresIn,
  } as jwt.SignOptions);
}

/**
 * Verifies and decodes a session JWT.
 * Accepts legacy tokens with type 'runner' or 'admin' and normalizes them
 * to the UnifiedSession shape.
 * Throws TOKEN_EXPIRED if expired, or a generic error for invalid tokens.
 */
export function validateSessionToken(token: string): UnifiedSession {
  const secret = getSecret();
  try {
    const raw = jwt.verify(token, secret) as Record<string, unknown>;

    // Normalize legacy token types to unified shape
    const legacyType = raw.type as string | undefined;

    if (legacyType === 'runner') {
      return {
        type: 'session',
        userId: (raw.runnerId as string) ?? (raw.userId as string) ?? '',
        email: (raw.email as string) ?? (raw.entraEmail as string) ?? '',
        role: (raw.role as UnifiedSession['role']) ?? 'runner',
        tenantId: (raw.tenantId as string) || null,
        emailVerified: (raw.emailVerified as boolean) ?? false,
      };
    }

    if (legacyType === 'admin') {
      return {
        type: 'session',
        userId: (raw.userId as string) ?? '',
        email: (raw.entraEmail as string) ?? (raw.email as string) ?? '',
        role: (raw.role as UnifiedSession['role']) ?? 'admin',
        tenantId: (raw.tenantId as string) || null,
        emailVerified: true,
      };
    }

    // Already a unified 'session' token
    return {
      type: 'session',
      userId: (raw.userId as string) ?? '',
      email: (raw.email as string) ?? '',
      role: (raw.role as UnifiedSession['role']) ?? 'runner',
      tenantId: (raw.tenantId as string) ?? null,
      emailVerified: (raw.emailVerified as boolean) ?? false,
    };
  } catch (err: unknown) {
    if (err instanceof jwt.TokenExpiredError) {
      const e = new Error('Token expired') as Error & { code: string };
      e.code = 'TOKEN_EXPIRED';
      throw e;
    }
    throw err;
  }
}
