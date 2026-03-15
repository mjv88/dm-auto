/**
 * tests/middleware/requireAuth.test.ts
 *
 * Unit tests for requireAuth, requireRole, and requireCompanyAccess middleware.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { requireAuth, requireRole, requireCompanyAccess } from '../../src/middleware/requireAuth';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../src/middleware/session', () => ({
  validateSessionToken: jest.fn(),
}));

jest.mock('../../src/db/index', () => ({
  getDb: jest.fn(),
}));

import { validateSessionToken } from '../../src/middleware/session';
import { getDb } from '../../src/db/index';
const mockValidate = validateSessionToken as jest.MockedFunction<typeof validateSessionToken>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(authHeader?: string): FastifyRequest {
  return {
    headers: {
      authorization: authHeader,
    },
  } as unknown as FastifyRequest;
}

function makeReply(): FastifyReply & { _status: number; _body: unknown } {
  const reply = {
    _status: 0,
    _body: null as unknown,
    code(status: number) {
      reply._status = status;
      return reply;
    },
    send(body: unknown) {
      reply._body = body;
      return reply;
    },
  };
  return reply as unknown as FastifyReply & { _status: number; _body: unknown };
}

function makeSession(overrides: Partial<{
  role: 'super_admin' | 'admin' | 'manager' | 'runner';
  userId: string;
  tenantId: string | null;
}> = {}) {
  return {
    type: 'session' as const,
    userId: overrides.userId ?? 'user-1',
    email: 'test@example.com',
    role: overrides.role ?? 'runner',
    tenantId: overrides.tenantId ?? 'tenant-1',
    runnerId: 'runner-1',
    emailVerified: true,
    pbxFqdn: 'pbx.example.com',
    extensionNumber: '101',
    entraEmail: 'test@example.com',
    tid: null,
    oid: null,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

describe('requireAuth', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const req = makeRequest();
    const reply = makeReply();
    await requireAuth(req, reply);
    expect(reply._status).toBe(401);
    expect(reply._body).toEqual({ error: 'UNAUTHORIZED', message: 'Missing Bearer token' });
  });

  it('returns 401 when token is invalid', async () => {
    mockValidate.mockImplementation(() => { throw new Error('bad'); });
    const req = makeRequest('Bearer bad-token');
    const reply = makeReply();
    await requireAuth(req, reply);
    expect(reply._status).toBe(401);
    expect(reply._body).toEqual({ error: 'UNAUTHORIZED' });
  });

  it('returns 401 with TOKEN_EXPIRED for expired tokens', async () => {
    const err = new Error('expired') as Error & { code: string };
    err.code = 'TOKEN_EXPIRED';
    mockValidate.mockImplementation(() => { throw err; });
    const req = makeRequest('Bearer expired-token');
    const reply = makeReply();
    await requireAuth(req, reply);
    expect(reply._status).toBe(401);
    expect(reply._body).toEqual({ error: 'TOKEN_EXPIRED' });
  });

  it('attaches session on success', async () => {
    const session = makeSession();
    mockValidate.mockReturnValue(session);
    const req = makeRequest('Bearer valid-token');
    const reply = makeReply();
    await requireAuth(req, reply);
    expect(req.session).toEqual(session);
    expect(reply._status).toBe(0); // no error response
  });
});

describe('requireRole', () => {
  it('returns 401 when session is not attached', async () => {
    const req = makeRequest();
    const reply = makeReply();
    await requireRole('admin')(req, reply);
    expect(reply._status).toBe(401);
  });

  it('returns 403 when role is insufficient', async () => {
    const req = makeRequest();
    req.session = makeSession({ role: 'runner' });
    const reply = makeReply();
    await requireRole('admin')(req, reply);
    expect(reply._status).toBe(403);
    expect(reply._body).toEqual({ error: 'FORBIDDEN', message: 'Insufficient role' });
  });

  it('passes when role meets minimum', async () => {
    const req = makeRequest();
    req.session = makeSession({ role: 'admin' });
    const reply = makeReply();
    await requireRole('admin')(req, reply);
    expect(reply._status).toBe(0);
  });

  it('passes when role exceeds minimum (admin >= manager)', async () => {
    const req = makeRequest();
    req.session = makeSession({ role: 'admin' });
    const reply = makeReply();
    await requireRole('manager')(req, reply);
    expect(reply._status).toBe(0);
  });

  it('allows runner when runner role is required', async () => {
    const req = makeRequest();
    req.session = makeSession({ role: 'runner' });
    const reply = makeReply();
    await requireRole('runner')(req, reply);
    expect(reply._status).toBe(0);
  });

  it('rejects runner when manager role is required', async () => {
    const req = makeRequest();
    req.session = makeSession({ role: 'runner' });
    const reply = makeReply();
    await requireRole('manager')(req, reply);
    expect(reply._status).toBe(403);
  });
});

describe('requireCompanyAccess', () => {
  const getTenantId = (req: FastifyRequest) => (req as unknown as { params: { tenantId: string } }).params?.tenantId ?? null;

  it('returns 401 when session is not attached', async () => {
    const req = makeRequest();
    const reply = makeReply();
    await requireCompanyAccess(getTenantId)(req, reply);
    expect(reply._status).toBe(401);
  });

  it('passes for super_admin role regardless of tenant', async () => {
    const req = makeRequest();
    req.session = makeSession({ role: 'super_admin' });
    const reply = makeReply();
    await requireCompanyAccess(getTenantId)(req, reply);
    expect(reply._status).toBe(0);
  });

  it('returns 400 when tenant ID is missing', async () => {
    const req = makeRequest();
    req.session = makeSession({ role: 'runner' });
    const reply = makeReply();
    await requireCompanyAccess(() => null)(req, reply);
    expect(reply._status).toBe(400);
    expect(reply._body).toEqual({ error: 'MISSING_TENANT' });
  });

  it('passes for runner when session tenantId matches', async () => {
    const req = makeRequest();
    req.session = makeSession({ role: 'runner', tenantId: 'tenant-1' });
    const reply = makeReply();
    await requireCompanyAccess(() => 'tenant-1')(req, reply);
    expect(reply._status).toBe(0);
  });

  it('returns 403 for runner when session tenantId does not match', async () => {
    const req = makeRequest();
    req.session = makeSession({ role: 'runner', tenantId: 'tenant-1' });
    const reply = makeReply();
    await requireCompanyAccess(() => 'tenant-2')(req, reply);
    expect(reply._status).toBe(403);
    expect(reply._body).toEqual({ error: 'FORBIDDEN' });
  });

  it('passes for manager with access to the tenant', async () => {
    const mockDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ tenantId: 'tenant-1' }]),
        }),
      }),
    };
    (getDb as jest.Mock).mockReturnValue(mockDb);

    const req = makeRequest();
    req.session = makeSession({ role: 'manager', userId: 'mgr-1' });
    const reply = makeReply();
    await requireCompanyAccess(() => 'tenant-1')(req, reply);
    expect(reply._status).toBe(0);
  });

  it('returns 403 for manager without access to the tenant', async () => {
    const mockDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ tenantId: 'other-tenant' }]),
        }),
      }),
    };
    (getDb as jest.Mock).mockReturnValue(mockDb);

    const req = makeRequest();
    req.session = makeSession({ role: 'manager', userId: 'mgr-1' });
    const reply = makeReply();
    await requireCompanyAccess(() => 'tenant-1')(req, reply);
    expect(reply._status).toBe(403);
    expect(reply._body).toEqual({ error: 'FORBIDDEN', message: 'No access to this company' });
  });
});
