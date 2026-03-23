import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { validateSessionToken } from './session.js';
import type { UnifiedSession } from './session.js';
import { getDb } from '../db/index.js';
import { managerTenants } from '../db/schema.js';

declare module 'fastify' {
  interface FastifyRequest {
    session?: UnifiedSession;
  }
}

const ROLE_HIERARCHY: Record<string, number> = { super_admin: 4, admin: 3, manager: 2, runner: 1 };

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Read token from httpOnly cookie first, fallback to Bearer header
  const cookies = request.cookies as Record<string, string> | undefined;
  const cookieToken = cookies?.runner_session;
  const bearerHeader = request.headers.authorization;
  const bearerToken = bearerHeader?.startsWith('Bearer ') ? bearerHeader.slice(7) : undefined;
  const token = cookieToken || bearerToken;

  // Debug logging — remove after cookie auth is verified
  request.log.debug({
    hasCookies: !!cookies,
    cookieKeys: cookies ? Object.keys(cookies) : [],
    hasCookieToken: !!cookieToken,
    hasBearerToken: !!bearerToken,
    url: request.url,
  }, 'requireAuth: token resolution');

  if (!token) {
    request.log.warn({
      url: request.url,
      hasCookies: !!cookies,
      cookieKeys: cookies ? Object.keys(cookies) : [],
      hasAuthHeader: !!bearerHeader,
    }, 'requireAuth: no token found — returning 401');
    return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Missing session' });
  }
  try {
    request.session = validateSessionToken(token);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'TOKEN_EXPIRED') return reply.code(401).send({ error: 'TOKEN_EXPIRED' });
    return reply.code(401).send({ error: 'UNAUTHORIZED' });
  }
}

export function requireRole(...roles: Array<'super_admin' | 'admin' | 'manager' | 'runner'>) {
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

export function requireCompanyAccess(getTenantId: (request: FastifyRequest) => string | null) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const session = request.session;
    if (!session) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (session.role === 'super_admin') return; // Super admin always passes
    const tenantId = getTenantId(request);
    if (!tenantId) return reply.code(400).send({ error: 'MISSING_TENANT' });
    if (session.role === 'admin' || session.role === 'manager') {
      const db = getDb();
      const rows = await db.select({ tenantId: managerTenants.tenantId }).from(managerTenants).where(eq(managerTenants.userId, session.userId));
      if (!rows.some(r => r.tenantId === tenantId)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'No access to this company' });
      }
      return;
    }
    if (session.tenantId !== tenantId) {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }
  };
}
