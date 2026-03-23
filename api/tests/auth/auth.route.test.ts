/**
 * tests/auth/auth.route.test.ts
 *
 * Integration tests for POST /runner/auth.
 * Microsoft token validation and Entra group checks are mocked.
 * DB queries use in-memory mock objects.
 */

import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { authRoutes } from '../../src/routes/auth';

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_ID_TOKEN = 'x'.repeat(200); // satisfies min(100) schema check
const TEST_EMAIL = 'runner@customer.com';
const TEST_TID = 'tid-aaaa-1111';
const TEST_OID = 'oid-bbbb-2222';
const TEST_TENANT_ID = 'tenant-uuid-0001';
const TEST_GROUP_ID = 'group-uuid-0001';
const TEST_RUNNER_ID = 'runner-uuid-0001';
const TEST_PBX_FQDN = 'pbx.customer.com';
const TEST_PBX_NAME = 'Customer PBX';
const TEST_EXTENSION = '101';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock validateMicrosoftToken
jest.mock('../../src/middleware/authenticate', () => ({
  ...jest.requireActual('../../src/middleware/authenticate'),
  validateMicrosoftToken: jest.fn(),
}));

// Mock checkEntraGroup
jest.mock('../../src/entra/groupCheck', () => ({
  checkEntraGroup: jest.fn(),
}));

// Mock getDb
jest.mock('../../src/db/index', () => ({
  getDb: jest.fn(),
}));

import { validateMicrosoftToken } from '../../src/middleware/authenticate';
import { checkEntraGroup } from '../../src/entra/groupCheck';
import { getDb } from '../../src/db/index';

// ── DB mock builder ────────────────────────────────────────────────────────────

/**
 * Creates a chainable Drizzle mock that returns different rows for
 * each select() call in sequence.
 */
function makeMockDb(tenantRows: unknown[], runnerRows: unknown[]) {
  let callCount = 0;
  const mockSelect = jest.fn().mockImplementation(() => ({
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockImplementation(() => ({
      limit: jest.fn().mockImplementation(() => {
        const rows = callCount === 0 ? tenantRows : runnerRows;
        callCount++;
        return Promise.resolve(rows);
      }),
      // For runner query without limit (using .where directly)
    })),
    innerJoin: jest.fn().mockReturnThis(),
    limit: jest.fn().mockImplementation(() => {
      const rows = callCount === 0 ? tenantRows : runnerRows;
      callCount++;
      return Promise.resolve(rows);
    }),
  }));
  return { select: mockSelect };
}

const mockTenant = {
  id: TEST_TENANT_ID,
  entraTenantId: TEST_TID,
  name: 'Test Tenant',
  entraGroupId: TEST_GROUP_ID,
  adminEmails: [],
  isActive: true,
};

const mockRunner = {
  id: TEST_RUNNER_ID,
  extensionNumber: TEST_EXTENSION,
  allowedDeptIds: ['dept-001'],
  pbxFqdn: TEST_PBX_FQDN,
  pbxName: TEST_PBX_NAME,
  pbxCredentialId: 'pbx-cred-uuid-0001',
};

// ── Test app factory ───────────────────────────────────────────────────────────

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(authRoutes);
  return app;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(() => {
  process.env.JWT_SECRET = 'b'.repeat(64);
  process.env.JWT_EXPIRES_IN = '1h';
});

afterAll(() => {
  delete process.env.JWT_SECRET;
  delete process.env.JWT_EXPIRES_IN;
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /runner/auth', () => {
  it('returns mode=direct + sessionToken for a single-PBX runner', async () => {
    (validateMicrosoftToken as jest.Mock).mockResolvedValue({
      email: TEST_EMAIL,
      tid: TEST_TID,
      oid: TEST_OID,
      name: 'Test Runner',
    });
    (checkEntraGroup as jest.Mock).mockResolvedValue(true);

    let selectCall = 0;
    (getDb as jest.Mock).mockReturnValue({
      select: jest.fn().mockImplementation(() => {
        selectCall++;
        if (selectCall === 1) {
          // User role lookup
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([{ id: 'user-uuid-0001', role: 'runner' }]),
              }),
            }),
          };
        }
        if (selectCall === 2) {
          // Tenant lookup
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([mockTenant]),
              }),
            }),
          };
        }
        // Runner lookup (with innerJoin)
        return {
          from: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([mockRunner]),
            }),
          }),
        };
      }),
    });

    const app = await buildApp();
    const resp = await app.inject({
      method: 'POST',
      url: '/runner/auth',
      payload: { idToken: VALID_ID_TOKEN },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.mode).toBe('direct');
    expect(body.runner.pbxFqdn).toBe(TEST_PBX_FQDN);
    expect(typeof body.sessionToken).toBe('string');
  });

  it('returns mode=select when runner is registered against multiple PBXes', async () => {
    (validateMicrosoftToken as jest.Mock).mockResolvedValue({
      email: TEST_EMAIL,
      tid: TEST_TID,
      oid: TEST_OID,
      name: 'Test Runner',
    });
    (checkEntraGroup as jest.Mock).mockResolvedValue(true);

    const runner2 = { ...mockRunner, id: 'runner-uuid-0002', pbxFqdn: 'pbx2.customer.com', pbxName: 'PBX 2' };

    let selectCall = 0;
    (getDb as jest.Mock).mockReturnValue({
      select: jest.fn().mockImplementation(() => {
        selectCall++;
        if (selectCall === 1) {
          // User role lookup
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([]),
              }),
            }),
          };
        }
        if (selectCall === 2) {
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([mockTenant]),
              }),
            }),
          };
        }
        return {
          from: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([mockRunner, runner2]),
            }),
          }),
        };
      }),
    });

    const app = await buildApp();
    const resp = await app.inject({
      method: 'POST',
      url: '/runner/auth',
      payload: { idToken: VALID_ID_TOKEN },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.mode).toBe('select');
    expect(body.options).toHaveLength(2);
  });

  it('returns 403 TENANT_NOT_REGISTERED when tenant not in DB', async () => {
    (validateMicrosoftToken as jest.Mock).mockResolvedValue({
      email: TEST_EMAIL,
      tid: 'unknown-tid',
      oid: TEST_OID,
      name: 'Test Runner',
    });
    let selectCall = 0;
    (getDb as jest.Mock).mockReturnValue({
      select: jest.fn().mockImplementation(() => {
        selectCall++;
        // Both user lookup and tenant lookup return empty
        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        };
      }),
    });

    const app = await buildApp();
    const resp = await app.inject({
      method: 'POST',
      url: '/runner/auth',
      payload: { idToken: VALID_ID_TOKEN },
    });

    expect(resp.statusCode).toBe(403);
    expect(resp.json().error).toBe('TENANT_NOT_REGISTERED');
  });

  it('returns 403 NOT_IN_RUNNERS_GROUP when user not in Entra group', async () => {
    (validateMicrosoftToken as jest.Mock).mockResolvedValue({
      email: TEST_EMAIL,
      tid: TEST_TID,
      oid: TEST_OID,
      name: 'Test Runner',
    });
    let selectCall = 0;
    (getDb as jest.Mock).mockReturnValue({
      select: jest.fn().mockImplementation(() => {
        selectCall++;
        if (selectCall === 1) {
          // User role lookup
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([]),
              }),
            }),
          };
        }
        // Tenant lookup
        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockTenant]),
            }),
          }),
        };
      }),
    });
    (checkEntraGroup as jest.Mock).mockResolvedValue(false);

    const app = await buildApp();
    const resp = await app.inject({
      method: 'POST',
      url: '/runner/auth',
      payload: { idToken: VALID_ID_TOKEN },
    });

    expect(resp.statusCode).toBe(403);
    expect(resp.json().error).toBe('NOT_IN_RUNNERS_GROUP');
  });

  it('returns 403 RUNNER_NOT_FOUND when no runner record exists', async () => {
    (validateMicrosoftToken as jest.Mock).mockResolvedValue({
      email: TEST_EMAIL,
      tid: TEST_TID,
      oid: TEST_OID,
      name: 'Test Runner',
    });
    (checkEntraGroup as jest.Mock).mockResolvedValue(true);

    let selectCall = 0;
    (getDb as jest.Mock).mockReturnValue({
      select: jest.fn().mockImplementation(() => {
        selectCall++;
        if (selectCall === 1) {
          // User role lookup
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([]),
              }),
            }),
          };
        }
        if (selectCall === 2) {
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([mockTenant]),
              }),
            }),
          };
        }
        return {
          from: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([]), // no runners
            }),
          }),
        };
      }),
    });

    const app = await buildApp();
    const resp = await app.inject({
      method: 'POST',
      url: '/runner/auth',
      payload: { idToken: VALID_ID_TOKEN },
    });

    expect(resp.statusCode).toBe(403);
    expect(resp.json().error).toBe('RUNNER_NOT_FOUND');
  });

  it('returns 401 TOKEN_EXPIRED when Microsoft token is expired', async () => {
    (validateMicrosoftToken as jest.Mock).mockRejectedValue(
      Object.assign(new Error('expired'), { code: 'TOKEN_EXPIRED' }),
    );

    const app = await buildApp();
    const resp = await app.inject({
      method: 'POST',
      url: '/runner/auth',
      payload: { idToken: VALID_ID_TOKEN },
    });

    expect(resp.statusCode).toBe(401);
    expect(resp.json().error).toBe('TOKEN_EXPIRED');
  });

  it('uses tenant group_id from DB (not from env)', async () => {
    const customGroupId = 'custom-group-from-db';
    (validateMicrosoftToken as jest.Mock).mockResolvedValue({
      email: TEST_EMAIL,
      tid: TEST_TID,
      oid: TEST_OID,
      name: 'Test Runner',
    });
    (checkEntraGroup as jest.Mock).mockResolvedValue(true);

    const tenantWithCustomGroup = { ...mockTenant, entraGroupId: customGroupId };
    let selectCall = 0;
    (getDb as jest.Mock).mockReturnValue({
      select: jest.fn().mockImplementation(() => {
        selectCall++;
        if (selectCall === 1) {
          // User role lookup
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([]),
              }),
            }),
          };
        }
        if (selectCall === 2) {
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([tenantWithCustomGroup]),
              }),
            }),
          };
        }
        return {
          from: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([mockRunner]),
            }),
          }),
        };
      }),
    });

    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/runner/auth',
      payload: { idToken: VALID_ID_TOKEN },
    });

    // Verify checkEntraGroup was called with the group_id from DB
    expect(checkEntraGroup).toHaveBeenCalledWith(TEST_OID, customGroupId);
  });
});
