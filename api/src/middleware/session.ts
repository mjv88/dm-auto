/**
 * src/middleware/session.ts
 *
 * Issues and validates internal session JWTs signed with JWT_SECRET.
 * Two session types exist:
 *   - RunnerSession  — issued after a successful /runner/auth
 *   - AdminSession   — issued after a successful admin login / tenant bootstrap
 */

import jwt from 'jsonwebtoken';

// ── Session types ──────────────────────────────────────────────────────────────

export interface RunnerSession {
  type: 'runner';
  runnerId: string;    // UUID from runners table
  tenantId: string;    // UUID from tenants table
  entraEmail: string;
  email: string;             // normalized email (entraEmail or local email)
  emailVerified: boolean;    // false for unverified local users, true for Entra
  pbxFqdn: string;
  extensionNumber: string;
}

export interface AdminSession {
  type: 'admin';
  tenantId: string;    // UUID from tenants table
  entraEmail: string;
  tid: string;         // Entra tenant ID (for multi-tenant context)
  oid: string;         // Entra object ID
}

export type AnySession = RunnerSession | AdminSession;

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
 * Works for both RunnerSession and AdminSession.
 */
export function createSessionToken(payload: AnySession): string {
  const secret = getSecret();
  const expiresIn = getExpiresIn();
  // jwt.sign accepts any object; cast through unknown to satisfy strict types
  return jwt.sign(payload as unknown as Record<string, unknown>, secret, {
    expiresIn,
  } as jwt.SignOptions);
}

/**
 * Verifies and decodes a session JWT.
 * Throws TOKEN_EXPIRED if expired, or a generic error for invalid tokens.
 */
export function validateSessionToken(token: string): AnySession {
  const secret = getSecret();
  try {
    return jwt.verify(token, secret) as AnySession;
  } catch (err: unknown) {
    if (err instanceof jwt.TokenExpiredError) {
      const e = new Error('Token expired') as Error & { code: string };
      e.code = 'TOKEN_EXPIRED';
      throw e;
    }
    throw err;
  }
}
