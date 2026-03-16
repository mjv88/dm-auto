/**
 * src/middleware/setupAuth.ts
 *
 * Fastify preHandler for the self-service onboarding wizard.
 * Accepts any valid session, extracts the user's email, looks up
 * the corresponding row in the `users` table to resolve userId
 * and tenantId, and attaches the result to `request.setupContext`.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { validateSessionToken } from './session.js';
import { getDb } from '../db/index.js';
import { users } from '../db/schema.js';

// ── FastifyRequest augmentation ──────────────────────────────────────────────

export interface SetupContext {
  userId: string;
  email: string;
  tenantId: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    setupContext?: SetupContext;
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Validates a Bearer JWT (any session type), resolves the user from
 * the `users` table by email, and attaches `setupContext` to the request.
 */
export async function setupAuthenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Missing Bearer token' });
  }

  const token = header.slice(7);

  let email: string;
  try {
    const session = validateSessionToken(token);
    email = session.email || '';
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'TOKEN_EXPIRED') {
      return reply.code(401).send({ error: 'TOKEN_EXPIRED' });
    }
    return reply.code(401).send({ error: 'UNAUTHORIZED' });
  }

  if (!email) {
    return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'No email in session' });
  }

  // Look up user by email
  const db = getDb();
  const rows = await db
    .select({ id: users.id, tenantId: users.tenantId })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const user = rows[0];
  if (!user) {
    return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'User not found' });
  }

  request.setupContext = {
    userId: user.id,
    email,
    tenantId: user.tenantId ?? null,
  };
}
