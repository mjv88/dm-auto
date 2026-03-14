/**
 * tests/auth/admin.test.ts
 *
 * Tests for admin route authorization:
 *   - Admin routes require admin_emails membership
 *   - PBX credential add validates connectivity before saving
 *   - PBX credentials are encrypted in DB
 */

import Fastify from 'fastify';
import nock from 'nock';
import { adminTenantRoutes } from '../../src/routes/admin/tenants';
import { adminPbxRoutes } from '../../src/routes/admin/pbx';
import { createSessionToken } from '../../src/middleware/session';
import type { AdminSession } from '../../src/middleware/session';

// ── Constants ─────────────────────────────────────────────────────────────────

const TEST_TENANT_ID = 'tenant-uuid-admin-0001';
const ADMIN_EMAIL = 'admin@customer.com';
const NON_ADMIN_EMAIL = 'notadmin@customer.com';
const TEST_PBX_FQDN = 'pbx.customer.com';
const JWT_SECRET = 'c'.repeat(64);

// ── Mock DB ───────────────────────────────────────────────────────────────────

jest.mock('../../src/db/index', () => ({
  getDb: jest.fn(),
}));

// Mock adminAuthenticate to inject admin session directly
jest.mock('../../src/middleware/authenticate', () => ({
  adminAuthenticate: jest.fn(async (request: { adminSession?: AdminSession }) => {
    // adminSession injected by individual tests via request headers parsing
    // We'll set it up by decoding the Authorization header in the mock
    const header = (request as { headers?: { authorization?: string } }).headers?.authorization ?? '';
    if (!header.startsWith('Bearer ')) return;
    const token = header.slice(7);
    try {
      const { validateSessionToken } = jest.requireActual('../../src/middleware/session');
      const session = validateSessionToken(token) as AdminSession;
      request.adminSession = session;
    } catch {
      // leave adminSession undefined — route will return 401
    }
  }),
}));

import { getDb } from '../../src/db/index';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdminSession(email: string): AdminSession {
  return {
    type: 'session',
    userId: '',
    email: email,
    role: 'admin',
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

function makeToken(email: string): string {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.JWT_EXPIRES_IN = '1h';
  return createSessionToken(makeAdminSession(email));
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

// ── Tests: admin_emails authorization ─────────────────────────────────────────

describe('Admin routes — admin_emails check', () => {
  it('allows access when email is in admin_emails', async () => {
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
      headers: { Authorization: `Bearer ${makeToken(ADMIN_EMAIL)}` },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.tenant).toBeDefined();
  });

  it('returns 403 FORBIDDEN when email is NOT in admin_emails', async () => {
    const mockTenantRow = {
      id: TEST_TENANT_ID,
      entraTenantId: 'tid-0000',
      name: 'Test Tenant',
      entraGroupId: 'grp-0000',
      adminEmails: [ADMIN_EMAIL], // NON_ADMIN_EMAIL is not here
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
      headers: { Authorization: `Bearer ${makeToken(NON_ADMIN_EMAIL)}` },
    });

    expect(resp.statusCode).toBe(403);
    expect(resp.json().error).toBe('FORBIDDEN');
  });
});

// ── Tests: PBX credential add validates connectivity ──────────────────────────

describe('POST /admin/pbx — connectivity validation', () => {
  const adminToken = () => makeToken(ADMIN_EMAIL);

  function setupAdminDb() {
    let insertMock: jest.Mock;
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
