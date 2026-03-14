/**
 * src/middleware/authenticate.ts
 *
 * validateMicrosoftToken — verifies a Microsoft Entra ID token (multi-tenant).
 *   Uses the common JWKS endpoint so tokens from any customer tenant are accepted.
 *   Validates: aud === ENTRA_CLIENT_ID, issuer pattern, expiry.
 *   Returns: { email, name, tid, oid }
 *
 * authenticate — Fastify preHandler that validates an internal session JWT and
 *   attaches the decoded UnifiedSession to request.runnerContext.
 *
 * adminAuthenticate — Fastify preHandler for admin routes.
 *   Accepts either an admin session JWT or a Microsoft ID token (for bootstrap).
 *   Attaches UnifiedSession to request.adminSession.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { validateSessionToken } from './session.js';
import type { RunnerSession, AdminSession } from './session.js';

// Re-export types for convenience
export type { RunnerSession, AdminSession };

// ── JWKS client (multi-tenant common endpoint) ─────────────────────────────

const JWKS_URI =
  'https://login.microsoftonline.com/common/discovery/v2.0/keys';

const jwks = jwksClient({
  jwksUri: JWKS_URI,
  cache: true,
  cacheMaxAge: 10 * 60 * 1000, // 10 minutes
  rateLimit: true,
});

// ── FastifyRequest augmentation ────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    runnerContext?: RunnerSession;
    adminSession?: AdminSession;
  }
}

// ── Token payload returned from validateMicrosoftToken ────────────────────

export interface TokenPayload {
  email: string;
  name: string;
  tid: string;
  oid: string;
}

// ── Microsoft token validation ─────────────────────────────────────────────

/**
 * Validates a Microsoft Entra ID token.
 *
 * Multi-tenant: accepts tokens issued by any customer tenant.
 * The JWKS URI uses the `common` (tenant-independent) endpoint so signing
 * keys for all tenants are available from a single location.
 *
 * Validates:
 *   - Signature via JWKS
 *   - aud === ENTRA_CLIENT_ID (your app)
 *   - iss matches https://login.microsoftonline.com/{tid}/v2.0
 *   - exp not expired
 */
export async function validateMicrosoftToken(
  idToken: string,
): Promise<TokenPayload> {
  const clientId = process.env.ENTRA_CLIENT_ID;
  if (!clientId) throw new Error('ENTRA_CLIENT_ID is not configured');

  // Decode header to get kid (without verifying — we need kid to fetch the key)
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || typeof decoded.payload !== 'object' || !decoded.header.kid) {
    const e = new Error('Malformed token') as Error & { code: string };
    e.code = 'TOKEN_EXPIRED';
    throw e;
  }

  // Fetch the public key for this token's kid
  let signingKey: jwksClient.SigningKey;
  try {
    signingKey = await jwks.getSigningKey(decoded.header.kid);
  } catch {
    const e = new Error('Unable to fetch signing key') as Error & {
      code: string;
    };
    e.code = 'TOKEN_EXPIRED';
    throw e;
  }
  const publicKey = signingKey.getPublicKey();

  // Verify signature + audience + expiry
  let verified: jwt.JwtPayload;
  try {
    verified = jwt.verify(idToken, publicKey, {
      audience: clientId,
      algorithms: ['RS256'],
    }) as jwt.JwtPayload;
  } catch (err: unknown) {
    if (err instanceof jwt.TokenExpiredError) {
      const e = new Error('Token expired') as Error & { code: string };
      e.code = 'TOKEN_EXPIRED';
      throw e;
    }
    throw err;
  }

  // Validate issuer matches Microsoft multi-tenant pattern
  const issuer = verified.iss as string | undefined;
  if (
    !issuer ||
    !/^https:\/\/login\.microsoftonline\.com\/[^/]+\/v2\.0$/.test(issuer)
  ) {
    const e = new Error(`Invalid token issuer: ${issuer}`) as Error & {
      code: string;
    };
    e.code = 'TOKEN_EXPIRED';
    throw e;
  }

  // Extract claims — Microsoft ID tokens use preferred_username or email
  const email =
    (verified['email'] as string | undefined) ??
    (verified['preferred_username'] as string | undefined) ??
    '';

  return {
    email,
    name: (verified['name'] as string | undefined) ?? '',
    tid: (verified['tid'] as string) ?? '',
    oid: (verified['oid'] as string) ?? '',
  };
}

// ── Fastify middleware ─────────────────────────────────────────────────────

/**
 * Runner route preHandler.
 * Expects: Authorization: Bearer <session-jwt>
 * On success: attaches UnifiedSession to request.runnerContext.
 * Rejects admin-role sessions (they should use admin routes).
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Missing Bearer token' });
  }
  const token = header.slice(7);
  try {
    const session = validateSessionToken(token);
    // Unified sessions always have type 'session'; check role for runner access
    if (session.role === 'admin' && !session.runnerId) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Not a runner session' });
    }
    request.runnerContext = session;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'TOKEN_EXPIRED') {
      return reply.code(401).send({ error: 'TOKEN_EXPIRED' });
    }
    return reply.code(401).send({ error: 'UNAUTHORIZED' });
  }
}

/**
 * Admin route preHandler.
 * Expects: Authorization: Bearer <admin-session-jwt> or <microsoft-id-token>
 * On success: attaches UnifiedSession to request.adminSession.
 * Returns 401 if token is missing/invalid, 403 if not an admin session.
 */
export async function adminAuthenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Missing Bearer token' });
  }
  const token = header.slice(7);

  // Try admin session JWT first (fast path for subsequent requests)
  try {
    const session = validateSessionToken(token);
    // Accept sessions with admin role (unified type is always 'session')
    if (session.role === 'admin') {
      request.adminSession = session;
      return;
    }
  } catch {
    // Fall through to Microsoft ID token validation
  }

  // Fall back: validate as Microsoft ID token (first login / bootstrap)
  try {
    const payload = await validateMicrosoftToken(token);
    // Attach a partial admin session — the route handler will complete it
    // (e.g. look up / create the tenant and issue a proper admin session JWT)
    request.adminSession = {
      type: 'session',
      userId: '',
      email: payload.email,
      role: 'admin',
      tenantId: '', // filled in by the route handler after DB lookup
      runnerId: null,
      emailVerified: true,
      pbxFqdn: null,
      extensionNumber: null,
      entraEmail: payload.email,
      tid: payload.tid,
      oid: payload.oid,
    };
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'TOKEN_EXPIRED') {
      return reply.code(401).send({ error: 'TOKEN_EXPIRED' });
    }
    return reply.code(401).send({ error: 'UNAUTHORIZED' });
  }
}
