/**
 * tests/auth/admin.test.ts
 *
 * Tests for admin route authorization:
 *   - Admin routes require manager or admin role
 *   - PBX credential add validates connectivity before saving
 *   - PBX credentials are encrypted in DB
 */

import Fastify from 'fastify';
import nock from 'nock';
import { adminTenantRoutes } from '../../src/routes/admin/tenants';
import { adminPbxRoutes } from '../../src/routes/admin/pbx';
import { createSessionToken } from '../../src/middleware/session';
import type { UnifiedSession } from '../../src/middleware/session';

// ── Constants ─────────────────────────────────────────────────────────────────

const TEST_TENANT_ID = 'tenant-uuid-admin-0001';
const ADMIN_EMAIL = 'admin@customer.com';
const RUNNER_EMAIL = 'runner@customer.com';
const TEST_PBX_FQDN = 'pbx.customer.com';
const JWT_SECRET = 'c'.repeat(64);

// ── Mock DB ───────────────────────────────────────────────────────────────────

jest.mock('../../src/db/index', () => ({
  getDb: jest.fn(),
}));

// Mock requireAuth to inject session from token
jest.mock('../../src/middleware/requireAuth', () => ({
  requireAuth: jest.fn(async (request: { session?: UnifiedSession; headers?: { authorization?: string } }, reply: { code: (n: number) => { send: (body: unknown) => void } }) => {
    const header = request.headers?.authorization ?? '';
    if (!header.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'UNAUTHORIZED' });
    }
    const token = header.slice(7);
    try {
      const { validateSessionToken } = jest.requireActual('../../src/middleware/session');
      request.session = validateSessionToken(token) as UnifiedSession;
    } catch {
      return reply.code(401).send({ error: 'UNAUTHORIZED' });
    }
  }),
  requireRole: jest.fn((...roles: string[]) => {
    return async (request: { session?: UnifiedSession }, reply: { code: (n: number) => { send: (body: unknown) => void } }) => {
      const session = request.session;
      if (!session) return reply.code(401).send({ error: 'UNAUTHORIZED' });
      const hierarchy: Record<string, number> = { admin: 3, manager: 2, runner: 1 };
      const userLevel = hierarchy[session.role] ?? 0;
      const minLevel = Math.min(...roles.map(r => hierarchy[r] ?? 0));
      if (userLevel < minLevel) {
        return reply.code(403).send({ error: 'FORBIDDEN' });
      }
    };
  }),
}));

import { getDb } from '../../src/db/index';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(email: string, role: 'admin' | 'manager' | 'runner'): UnifiedSession {
  return {
    type: 'session',
    userId: '',
    email: email,
    role,
    tenantId: TEST_TENANT_ID,
    runnerId: null,
    emailVerified: true,
    pbxFqdn: null,
    extensionNumber: null,
    entraEmail: email,
    tid: 'tid-0000',
    oid: 'oid-0000',
  };
}

function makeToken(email: string, role: 'admin' | 'manager' | 'runner' = 'admin'): string {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.JWT_EXPIRES_IN = '1h';
  return createSessionToken(makeSession(email, role));
}

async function buildTenantApp() {
  const app = Fastify({ logger: false });
  await app.register(adminTenantRoutes);
  return app;
}

async function buildPbxApp() {
  const app = Fastify({ logger: false });
  await app.register(adminPbxRoutes);
  return app;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.ENCRYPTION_KEY = '0'.repeat(64);
  nock.disableNetConnect();
});

afterAll(() => {
  nock.enableNetConnect();
  nock.cleanAll();
});

beforeEach(() => {
  nock.cleanAll();
  jest.clearAllMocks();
});

// ── Tests: role-based authorization ──────────────────────────────────────────

describe('Admin routes — role check', () => {
  it('allows access for admin role', async () => {
    const mockTenantRow = {
      id: TEST_TENANT_ID,
      entraTenantId: 'tid-0000',
      name: 'Test Tenant',
      entraGroupId: 'grp-0000',
      adminEmails: [ADMIN_EMAIL],
      isActive: true,
    };

    (getDb as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockTenantRow]),
          }),
        }),
      }),
    });

    const app = await buildTenantApp();
    const resp = await app.inject({
      method: 'GET',
      url: '/admin/tenants/me',
      headers: { Authorization: `Bearer ${makeToken(ADMIN_EMAIL, 'admin')}` },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.tenant).toBeDefined();
  });

  it('returns 403 FORBIDDEN when role is runner', async () => {
    const app = await buildTenantApp();
    const resp = await app.inject({
      method: 'GET',
      url: '/admin/tenants/me',
      headers: { Authorization: `Bearer ${makeToken(RUNNER_EMAIL, 'runner')}` },
    });

    expect(resp.statusCode).toBe(403);
    expect(resp.json().error).toBe('FORBIDDEN');
  });
});

// ── Tests: PBX credential add validates connectivity ──────────────────────────

describe('POST /admin/pbx — connectivity validation', () => {
  const adminToken = () => makeToken(ADMIN_EMAIL);

  function setupAdminDb() {
    const db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([
              { id: TEST_TENANT_ID, adminEmails: [ADMIN_EMAIL] },
            ]),
          }),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([
            { id: 'new-pbx-uuid', pbxFqdn: TEST_PBX_FQDN, pbxName: 'Customer PBX' },
          ]),
        }),
      }),
    };
    (getDb as jest.Mock).mockReturnValue(db);
    return db;
  }

  it('returns 201 when PBX connectivity succeeds', async () => {
    setupAdminDb();

    // Mock PBX token endpoint
    nock(`https://${TEST_PBX_FQDN}`)
      .post('/connect/token')
      .reply(200, { access_token: 'pbx-token', expires_in: 3600 });

    // Mock PBX Groups endpoint (connectivity check)
    nock(`https://${TEST_PBX_FQDN}`)
      .get('/xapi/v1/Groups?$top=1')
      .reply(200, { value: [{ Id: 1, Name: 'DEFAULT' }] });

    const app = await buildPbxApp();
    const resp = await app.inject({
      method: 'POST',
      url: '/admin/pbx',
      headers: {
        Authorization: `Bearer ${adminToken()}`,
        'Content-Type': 'application/json',
      },
      payload: {
        fqdn: TEST_PBX_FQDN,
        name: 'Customer PBX',
        authMode: 'xapi',
        credentials: {
          mode: 'xapi',
          clientId: 'xapi-client-id',
          secret: 'xapi-secret',
        },
      },
    });

    expect(resp.statusCode).toBe(201);
    expect(nock.isDone()).toBe(true);
  });

  it('returns 422 XAPI_AUTH_FAILED when PBX token endpoint rejects credentials', async () => {
    setupAdminDb();

    nock(`https://${TEST_PBX_FQDN}`)
      .post('/connect/token')
      .reply(401, { error: 'invalid_client' });

    const app = await buildPbxApp();
    const resp = await app.inject({
      method: 'POST',
      url: '/admin/pbx',
      headers: {
        Authorization: `Bearer ${adminToken()}`,
        'Content-Type': 'application/json',
      },
      payload: {
        fqdn: TEST_PBX_FQDN,
        name: 'Customer PBX',
        authMode: 'xapi',
        credentials: {
          mode: 'xapi',
          clientId: 'bad-client',
          secret: 'bad-secret',
        },
      },
    });

    expect(resp.statusCode).toBe(422);
    expect(resp.json().error).toBe('XAPI_AUTH_FAILED');
    expect(nock.isDone()).toBe(true);
  });

  it('encrypts credentials before storing in DB', async () => {
    const db = setupAdminDb();

    nock(`https://${TEST_PBX_FQDN}`)
      .post('/connect/token')
      .reply(200, { access_token: 'pbx-token', expires_in: 3600 });

    nock(`https://${TEST_PBX_FQDN}`)
      .get('/xapi/v1/Groups?$top=1')
      .reply(200, { value: [] });

    const app = await buildPbxApp();
    await app.inject({
      method: 'POST',
      url: '/admin/pbx',
      headers: {
        Authorization: `Bearer ${adminToken()}`,
        'Content-Type': 'application/json',
      },
      payload: {
        fqdn: TEST_PBX_FQDN,
        name: 'Customer PBX',
        authMode: 'xapi',
        credentials: {
          mode: 'xapi',
          clientId: 'real-client-id',
          secret: 'real-secret',
        },
      },
    });

    // Check what was passed to db.insert().values()
    const insertCallArg = (db.insert as jest.Mock).mock.results[0]?.value;
    const valuesCallArg = insertCallArg?.values?.mock?.calls[0]?.[0];

    expect(valuesCallArg).toBeDefined();
    // Encrypted fields must NOT equal the plaintext credentials
    expect(valuesCallArg.xapiClientId).not.toBe('real-client-id');
    expect(valuesCallArg.xapiSecret).not.toBe('real-secret');
    // Must follow iv:tag:ciphertext format
    expect(valuesCallArg.xapiClientId).toMatch(/^[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/);
    expect(valuesCallArg.xapiSecret).toMatch(/^[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/);
  });
});
