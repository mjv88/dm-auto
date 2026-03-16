import type { FastifyRequest, FastifyReply } from 'fastify';
import { validateSessionToken } from './session.js';
import type { UnifiedSession } from './session.js';

declare module 'fastify' {
  interface FastifyRequest {
    session?: UnifiedSession;
  }
}

const ROLE_HIERARCHY: Record<string, number> = { super_admin: 4, admin: 3, runner: 1 };

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Missing Bearer token' });
  }
  try {
    request.session = validateSessionToken(header.slice(7));
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'TOKEN_EXPIRED') return reply.code(401).send({ error: 'TOKEN_EXPIRED' });
    return reply.code(401).send({ error: 'UNAUTHORIZED' });
  }
}

export function requireRole(...roles: Array<'super_admin' | 'admin' | 'runner'>) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const session = request.session;
    if (!session) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const userLevel = ROLE_HIERARCHY[session.role] ?? 0;
    const minLevel = Math.min(...roles.map(r => ROLE_HIERARCHY[r] ?? 0));
    if (userLevel < minLevel) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Insufficient role' });
    }
  };
}
