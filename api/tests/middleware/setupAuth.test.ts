/**
 * tests/middleware/setupAuth.test.ts
 *
 * Unit tests for the setupAuthenticate middleware.
 * Mocks the DB and session validation to test request handling in isolation.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { setupAuthenticate } from '../../src/middleware/setupAuth';

// ── Mocks ────────────────────────────────────────────────────────────────────

/** Rows the mock DB should return for the next query. */
let mockDbRows: unknown[] = [];

jest.mock('../../src/db/index', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(mockDbRows),
        }),
      }),
    }),
  }),
}));

jest.mock('../../src/middleware/session', () => ({
  validateSessionToken: jest.fn(),
}));

import { validateSessionToken } from '../../src/middleware/session';
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

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockDbRows = [];
});

describe('setupAuthenticate', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const req = makeRequest();
    const reply = makeReply();

    await setupAuthenticate(req, reply);

    expect(reply._status).toBe(401);
    expect(reply._body).toEqual({ error: 'UNAUTHORIZED', message: 'Missing Bearer token' });
  });

  it('returns 401 when token is invalid', async () => {
    mockValidate.mockImplementation(() => {
      throw new Error('bad token');
    });

    const req = makeRequest('Bearer bad-token');
    const reply = makeReply();

    await setupAuthenticate(req, reply);

    expect(reply._status).toBe(401);
    expect(reply._body).toEqual({ error: 'UNAUTHORIZED' });
  });

  it('returns 401 with TOKEN_EXPIRED for expired tokens', async () => {
    const err = new Error('Token expired') as Error & { code: string };
    err.code = 'TOKEN_EXPIRED';
    mockValidate.mockImplementation(() => { throw err; });

    const req = makeRequest('Bearer expired-token');
    const reply = makeReply();

    await setupAuthenticate(req, reply);

    expect(reply._status).toBe(401);
    expect(reply._body).toEqual({ error: 'TOKEN_EXPIRED' });
  });

  it('returns 401 when user is not found in the DB', async () => {
    mockValidate.mockReturnValue({
      type: 'runner',
      runnerId: 'r1',
      tenantId: 't1',
      entraEmail: 'user@example.com',
      email: 'user@example.com',
      emailVerified: true,
      pbxFqdn: 'pbx.example.com',
      extensionNumber: '101',
    });
    mockDbRows = [];

    const req = makeRequest('Bearer valid-token');
    const reply = makeReply();

    await setupAuthenticate(req, reply);

    expect(reply._status).toBe(401);
    expect(reply._body).toEqual({ error: 'UNAUTHORIZED', message: 'User not found' });
  });

  it('attaches setupContext on success with runner session', async () => {
    mockValidate.mockReturnValue({
      type: 'runner',
      runnerId: 'r1',
      tenantId: 't1',
      entraEmail: 'user@example.com',
      email: 'user@example.com',
      emailVerified: true,
      pbxFqdn: 'pbx.example.com',
      extensionNumber: '101',
    });
    mockDbRows = [{ id: 'user-uuid', tenantId: 'tenant-uuid' }];

    const req = makeRequest('Bearer valid-token');
    const reply = makeReply();

    await setupAuthenticate(req, reply);

    expect(req.setupContext).toEqual({
      userId: 'user-uuid',
      email: 'user@example.com',
      tenantId: 'tenant-uuid',
    });
    // reply should not have been called with an error
    expect(reply._status).toBe(0);
  });

  it('attaches setupContext on success with admin session', async () => {
    mockValidate.mockReturnValue({
      type: 'admin',
      tenantId: 't1',
      entraEmail: 'admin@example.com',
      tid: 'entra-tid',
      oid: 'entra-oid',
    });
    mockDbRows = [{ id: 'admin-uuid', tenantId: null }];

    const req = makeRequest('Bearer valid-admin-token');
    const reply = makeReply();

    await setupAuthenticate(req, reply);

    expect(req.setupContext).toEqual({
      userId: 'admin-uuid',
      email: 'admin@example.com',
      tenantId: null,
    });
    expect(reply._status).toBe(0);
  });
});
