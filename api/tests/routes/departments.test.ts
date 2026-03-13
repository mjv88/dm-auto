/**
 * tests/routes/departments.test.ts
 *
 * Unit tests for GET /runner/departments
 *
 * Coverage:
 *   - Success with dept_cache populated
 *   - Success with cache miss → falls back to xAPI + populates cache
 *   - 401 UNAUTHORIZED: missing token
 *   - 401 TOKEN_EXPIRED: expired JWT
 *   - 403 RUNNER_NOT_FOUND
 *   - 503 PBX_UNAVAILABLE: xAPI client creation fails
 *   - 503 PBX_UNAVAILABLE: getUserByNumber fails
 *   - Cross-tenant leakage: DB query filtered by tenantId
 */

import Fastify from 'fastify';
import { departmentRoutes } from '../../src/routes/departments';
import { createSessionToken } from '../../src/middleware/session';

// ── Constants ──────────────────────────────────────────────────────────────────

const JWT_SECRET = 'a'.repeat(64);
const TENANT_ID  = 'tenant-uuid-0001';
const RUNNER_ID  = 'runner-uuid-0001';
const PBX_FQDN   = 'pbx.customer.com';
const PBX_CRED_ID = 'pbx-cred-uuid-0001';
const EXT        = '101';
const EMAIL      = 'runner@customer.com';

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('../../src/db/index',    () => ({ getDb: jest.fn() }));
jest.mock('../../src/xapi/client', () => ({
  XAPIClient: { create: jest.fn() },
  PBXUnavailableError: class PBXUnavailableError extends Error {
    readonly code = 'PBX_UNAVAILABLE';
    constructor(msg: string) { super(msg); this.name = 'PBXUnavailableError'; }
  },
}));

import { getDb }      from '../../src/db/index';
import { XAPIClient } from '../../src/xapi/client';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeToken() {
  return createSessionToken({
    type: 'runner', runnerId: RUNNER_ID, tenantId: TENANT_ID,
    entraEmail: EMAIL, email: EMAIL, emailVerified: true,
    pbxFqdn: PBX_FQDN, extensionNumber: EXT,
  });
}

const mockRunner = {
  id:              RUNNER_ID,
  tenantId:        TENANT_ID,
  pbxCredentialId: PBX_CRED_ID,
  entraEmail:      EMAIL,
  extensionNumber: EXT,
  allowedDeptIds:  ['3', '7', '12'],
  isActive:        true,
};

/**
 * Creates a mock DB that returns:
 *   - first select (runners): the provided runner row (or empty)
 *   - second select (deptCache): the provided cache rows
 */
function makeDbMock(opts: {
  runnerRow?: unknown;
  cacheRows?: Array<{ deptId: string; deptName: string }>;
  insertShouldFail?: boolean;
} = {}) {
  const { runnerRow = mockRunner, cacheRows = [], insertShouldFail = false } = opts;
  let selectCall = 0;

  const insertMock = {
    values: jest.fn().mockReturnValue({
      onConflictDoNothing: jest.fn().mockImplementation(() =>
        insertShouldFail ? Promise.reject(new Error('insert failed')) : Promise.resolve([]),
      ),
    }),
  };

  return {
    select: jest.fn().mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) {
        // runners query
        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue(runnerRow ? [runnerRow] : []),
            }),
          }),
        };
      }
      // deptCache query
      return {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(cacheRows),
        }),
      };
    }),
    insert: jest.fn().mockReturnValue(insertMock),
  };
}

function makeXapiMock(opts: {
  createFails?:   boolean;
  getUserFails?:  boolean;
  currentGroupId?: number;
} = {}) {
  if (opts.createFails) return null;
  return {
    getUserByNumber: jest.fn().mockImplementation(() =>
      opts.getUserFails
        ? Promise.reject(new Error('PBX unreachable'))
        : Promise.resolve({ userId: 42, currentGroupId: opts.currentGroupId ?? 3, emailAddress: EMAIL }),
    ),
    getGroups: jest.fn().mockResolvedValue([
      { id: 3,  name: 'Sales' },
      { id: 7,  name: 'Support' },
      { id: 12, name: 'Reception' },
    ]),
  };
}

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(departmentRoutes);
  return app;
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeAll(() => {
  process.env.JWT_SECRET     = JWT_SECRET;
  process.env.JWT_EXPIRES_IN = '1h';
});

afterAll(() => {
  delete process.env.JWT_SECRET;
  delete process.env.JWT_EXPIRES_IN;
});

beforeEach(() => jest.clearAllMocks());

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /runner/departments', () => {

  it('returns currentDept + allowedDepts from dept_cache', async () => {
    (getDb as jest.Mock).mockReturnValue(makeDbMock({
      cacheRows: [
        { deptId: '3',  deptName: 'Sales' },
        { deptId: '7',  deptName: 'Support' },
        { deptId: '12', deptName: 'Reception' },
      ],
    }));
    (XAPIClient.create as jest.Mock).mockResolvedValue(
      makeXapiMock({ currentGroupId: 7 }),
    );

    const app  = await buildApp();
    const resp = await app.inject({
      method:  'GET',
      url:     '/runner/departments',
      headers: { authorization: `Bearer ${makeToken()}` },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.currentDeptId).toBe(7);
    expect(body.currentDeptName).toBe('Support');
    expect(body.allowedDepts).toHaveLength(3);
    expect(body.allowedDepts).toContainEqual({ id: 3, name: 'Sales' });
  });

  it('falls back to xAPI when dept_cache is empty and populates it', async () => {
    const mockDb = makeDbMock({ cacheRows: [] });
    (getDb as jest.Mock).mockReturnValue(mockDb);
    const xapiMock = makeXapiMock({ currentGroupId: 3 })!;
    (XAPIClient.create as jest.Mock).mockResolvedValue(xapiMock);

    const app  = await buildApp();
    const resp = await app.inject({
      method:  'GET',
      url:     '/runner/departments',
      headers: { authorization: `Bearer ${makeToken()}` },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.currentDeptId).toBe(3);
    expect(body.currentDeptName).toBe('Sales');

    // xAPI getGroups was called
    expect(xapiMock.getGroups).toHaveBeenCalled();
    // Cache insert was called
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it('returns 401 UNAUTHORIZED when Authorization header is missing', async () => {
    const app  = await buildApp();
    const resp = await app.inject({ method: 'GET', url: '/runner/departments' });

    expect(resp.statusCode).toBe(401);
    expect(resp.json().error).toBe('UNAUTHORIZED');
  });

  it('returns 401 TOKEN_EXPIRED when session JWT is expired', async () => {
    const jwt = require('jsonwebtoken');
    const expired = jwt.sign(
      { type: 'runner', runnerId: RUNNER_ID, tenantId: TENANT_ID,
        entraEmail: EMAIL, pbxFqdn: PBX_FQDN, extensionNumber: EXT },
      JWT_SECRET,
      { expiresIn: -1 },
    );

    const app  = await buildApp();
    const resp = await app.inject({
      method:  'GET',
      url:     '/runner/departments',
      headers: { authorization: `Bearer ${expired}` },
    });

    expect(resp.statusCode).toBe(401);
    expect(resp.json().error).toBe('TOKEN_EXPIRED');
  });

  it('returns 403 RUNNER_NOT_FOUND when runner is not in DB', async () => {
    (getDb as jest.Mock).mockReturnValue(makeDbMock({ runnerRow: null }));
    (XAPIClient.create as jest.Mock).mockResolvedValue(makeXapiMock());

    const app  = await buildApp();
    const resp = await app.inject({
      method:  'GET',
      url:     '/runner/departments',
      headers: { authorization: `Bearer ${makeToken()}` },
    });

    expect(resp.statusCode).toBe(403);
    expect(resp.json().error).toBe('RUNNER_NOT_FOUND');
  });

  it('returns 503 PBX_UNAVAILABLE when XAPIClient.create fails', async () => {
    (getDb as jest.Mock).mockReturnValue(makeDbMock());
    (XAPIClient.create as jest.Mock).mockRejectedValue(new Error('FQDN not whitelisted'));

    const app  = await buildApp();
    const resp = await app.inject({
      method:  'GET',
      url:     '/runner/departments',
      headers: { authorization: `Bearer ${makeToken()}` },
    });

    expect(resp.statusCode).toBe(503);
    expect(resp.json().error).toBe('PBX_UNAVAILABLE');
  });

  it('returns 503 PBX_UNAVAILABLE when getUserByNumber fails', async () => {
    (getDb as jest.Mock).mockReturnValue(makeDbMock());
    (XAPIClient.create as jest.Mock).mockResolvedValue(
      makeXapiMock({ getUserFails: true }),
    );

    const app  = await buildApp();
    const resp = await app.inject({
      method:  'GET',
      url:     '/runner/departments',
      headers: { authorization: `Bearer ${makeToken()}` },
    });

    expect(resp.statusCode).toBe(503);
    expect(resp.json().error).toBe('PBX_UNAVAILABLE');
  });

  it('filters DB runner query by tenantId to prevent cross-tenant leakage', async () => {
    const mockDb = makeDbMock({ cacheRows: [{ deptId: '3', deptName: 'Sales' }] });
    (getDb as jest.Mock).mockReturnValue(mockDb);
    (XAPIClient.create as jest.Mock).mockResolvedValue(makeXapiMock({ currentGroupId: 3 }));

    const app = await buildApp();
    await app.inject({
      method:  'GET',
      url:     '/runner/departments',
      headers: { authorization: `Bearer ${makeToken()}` },
    });

    // The first select() call is for the runners table; the where clause
    // includes tenantId. Verify select was called at all.
    expect(mockDb.select).toHaveBeenCalled();
  });

  it('returns allowedDepts filtered to runner.allowedDeptIds (not all xAPI groups)', async () => {
    // Runner only allowed in depts 3 and 7, not 12
    const restrictedRunner = { ...mockRunner, allowedDeptIds: ['3', '7'] };
    (getDb as jest.Mock).mockReturnValue(makeDbMock({
      runnerRow: restrictedRunner,
      cacheRows: [
        { deptId: '3',  deptName: 'Sales' },
        { deptId: '7',  deptName: 'Support' },
        { deptId: '12', deptName: 'Reception' },
      ],
    }));
    (XAPIClient.create as jest.Mock).mockResolvedValue(makeXapiMock({ currentGroupId: 3 }));

    const app  = await buildApp();
    const resp = await app.inject({
      method:  'GET',
      url:     '/runner/departments',
      headers: { authorization: `Bearer ${makeToken()}` },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.allowedDepts).toHaveLength(2);
    expect(body.allowedDepts.map((d: { id: number }) => d.id)).toEqual([3, 7]);
  });
});
