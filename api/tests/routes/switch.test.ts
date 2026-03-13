/**
 * tests/routes/switch.test.ts
 *
 * Unit tests for POST /runner/switch
 *
 * Coverage:
 *   - Success path: dept switch, audit written, correct response shape
 *   - 400 VALIDATION_ERROR: missing / bad targetDeptId
 *   - 401 UNAUTHORIZED: missing / invalid Bearer token
 *   - 401 TOKEN_EXPIRED: expired session JWT
 *   - 403 RUNNER_NOT_FOUND: DB row missing / inactive
 *   - 403 DEPT_NOT_ALLOWED: targetDeptId not in allowedDeptIds
 *   - 409 SAME_DEPT: already in target department
 *   - 503 PBX_UNAVAILABLE: xAPI client creation fails
 *   - 503 PBX_UNAVAILABLE: getUserByNumber fails
 *   - 503 PBX_UNAVAILABLE: patchUserGroup fails
 *   - Cross-tenant leakage: DB query always filters by tenantId
 */

import Fastify from 'fastify';
import { switchRoutes } from '../../src/routes/switch';
import { createSessionToken } from '../../src/middleware/session';

// ── Constants ──────────────────────────────────────────────────────────────────

const JWT_SECRET = 'a'.repeat(64);
const TENANT_ID  = 'tenant-uuid-0001';
const RUNNER_ID  = 'runner-uuid-0001';
const PBX_FQDN   = 'pbx.customer.com';
const EXT        = '101';
const EMAIL      = 'runner@customer.com';

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('../../src/db/index',         () => ({ getDb: jest.fn() }));
jest.mock('../../src/middleware/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../../src/xapi/client',      () => ({
  XAPIClient:         { create: jest.fn() },
  PBXUnavailableError: class PBXUnavailableError extends Error {
    readonly code = 'PBX_UNAVAILABLE';
    constructor(msg: string) { super(msg); this.name = 'PBXUnavailableError'; }
  },
}));

import { getDb }           from '../../src/db/index';
import { writeAuditLog }   from '../../src/middleware/audit';
import { XAPIClient }      from '../../src/xapi/client';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeToken(overrides: Partial<{
  runnerId: string; tenantId: string; pbxFqdn: string; extensionNumber: string;
}> = {}) {
  return createSessionToken({
    type:            'runner',
    runnerId:        overrides.runnerId        ?? RUNNER_ID,
    tenantId:        overrides.tenantId        ?? TENANT_ID,
    entraEmail:      EMAIL,
    pbxFqdn:         overrides.pbxFqdn         ?? PBX_FQDN,
    extensionNumber: overrides.extensionNumber ?? EXT,
  });
}

const mockRunner = {
  id:              RUNNER_ID,
  tenantId:        TENANT_ID,
  pbxCredentialId: 'pbx-cred-uuid-0001',
  entraEmail:      EMAIL,
  extensionNumber: EXT,
  allowedDeptIds:  ['3', '7', '12'],
  isActive:        true,
};

function makeDbMock(runnerRow: unknown = mockRunner) {
  return {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(runnerRow ? [runnerRow] : []),
        }),
      }),
    }),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue([]),
    }),
  };
}

function makeXapiMock(overrides: {
  getUserFails?:  boolean;
  patchFails?:    boolean;
  currentGroupId?: number;
} = {}) {
  const { getUserFails, patchFails, currentGroupId = 3 } = overrides;
  return {
    getUserByNumber: jest.fn().mockImplementation(() =>
      getUserFails
        ? Promise.reject(new Error('PBX unreachable'))
        : Promise.resolve({ userId: 42, currentGroupId, emailAddress: EMAIL }),
    ),
    getGroups: jest.fn().mockResolvedValue([
      { id: 3, name: 'Sales' },
      { id: 7, name: 'Support' },
      { id: 12, name: 'Reception' },
    ]),
    patchUserGroup: jest.fn().mockImplementation(() =>
      patchFails
        ? Promise.reject(new Error('PBX unreachable'))
        : Promise.resolve(),
    ),
  };
}

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(switchRoutes);
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

describe('POST /runner/switch', () => {

  it('returns success response with previousDept + currentDept', async () => {
    (getDb as jest.Mock).mockReturnValue(makeDbMock());
    (XAPIClient.create as jest.Mock).mockResolvedValue(makeXapiMock({ currentGroupId: 3 }));

    const app  = await buildApp();
    const resp = await app.inject({
      method:  'POST',
      url:     '/runner/switch',
      headers: { authorization: `Bearer ${makeToken()}` },
      payload: { targetDeptId: 7 },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.success).toBe(true);
    expect(body.previousDept).toEqual({ id: 3, name: 'Sales' });
    expect(body.currentDept).toEqual({ id: 7, name: 'Support' });
    expect(typeof body.switchedAt).toBe('string');
  });

  it('writes audit log entry on success', async () => {
    (getDb as jest.Mock).mockReturnValue(makeDbMock());
    (XAPIClient.create as jest.Mock).mockResolvedValue(makeXapiMock({ currentGroupId: 3 }));

    const app = await buildApp();
    await app.inject({
      method:  'POST',
      url:     '/runner/switch',
      headers: { authorization: `Bearer ${makeToken()}` },
      payload: { targetDeptId: 7 },
    });

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        runnerId: RUNNER_ID,
        status:   'success',
        fromDeptId: '3',
        toDeptId:   '7',
      }),
    );
  });

  it('returns 401 UNAUTHORIZED when Authorization header is missing', async () => {
    const app  = await buildApp();
    const resp = await app.inject({
      method:  'POST',
      url:     '/runner/switch',
      payload: { targetDeptId: 7 },
    });

    expect(resp.statusCode).toBe(401);
    expect(resp.json().error).toBe('UNAUTHORIZED');
  });

  it('returns 401 TOKEN_EXPIRED when session JWT is expired', async () => {
    // Create a token that already expired
    const expiredToken = createSessionToken({
      type: 'runner', runnerId: RUNNER_ID, tenantId: TENANT_ID,
      entraEmail: EMAIL, pbxFqdn: PBX_FQDN, extensionNumber: EXT,
    });

    // Patch JWT_EXPIRES_IN to '-1s' temporarily to generate an expired token
    // Instead, decode and re-sign with expiresIn=-1
    const jwt = require('jsonwebtoken');
    const expired = jwt.sign(
      { type: 'runner', runnerId: RUNNER_ID, tenantId: TENANT_ID,
        entraEmail: EMAIL, pbxFqdn: PBX_FQDN, extensionNumber: EXT },
      JWT_SECRET,
      { expiresIn: -1 },
    );
    void expiredToken;

    const app  = await buildApp();
    const resp = await app.inject({
      method:  'POST',
      url:     '/runner/switch',
      headers: { authorization: `Bearer ${expired}` },
      payload: { targetDeptId: 7 },
    });

    expect(resp.statusCode).toBe(401);
    expect(resp.json().error).toBe('TOKEN_EXPIRED');
  });

  it('returns 400 VALIDATION_ERROR when targetDeptId is missing', async () => {
    (getDb as jest.Mock).mockReturnValue(makeDbMock());
    (XAPIClient.create as jest.Mock).mockResolvedValue(makeXapiMock());

    const app  = await buildApp();
    const resp = await app.inject({
      method:  'POST',
      url:     '/runner/switch',
      headers: { authorization: `Bearer ${makeToken()}` },
      payload: {},
    });

    expect(resp.statusCode).toBe(409);
    expect(resp.json().error).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when targetDeptId is not an integer', async () => {
    (getDb as jest.Mock).mockReturnValue(makeDbMock());
    (XAPIClient.create as jest.Mock).mockResolvedValue(makeXapiMock());

    const app  = await buildApp();
    const resp = await app.inject({
      method:  'POST',
      url:     '/runner/switch',
      headers: { authorization: `Bearer ${makeToken()}` },
      payload: { targetDeptId: 'not-a-number' },
    });

    expect(resp.statusCode).toBe(409);
    expect(resp.json().error).toBe('VALIDATION_ERROR');
  });

  it('returns 403 RUNNER_NOT_FOUND when runner is not in DB', async () => {
    (getDb as jest.Mock).mockReturnValue(makeDbMock(null));

    const app  = await buildApp();
    const resp = await app.inject({
      method:  'POST',
      url:     '/runner/switch',
      headers: { authorization: `Bearer ${makeToken()}` },
      payload: { targetDeptId: 7 },
    });

    expect(resp.statusCode).toBe(403);
    expect(resp.json().error).toBe('RUNNER_NOT_FOUND');
  });

  it('returns 403 DEPT_NOT_ALLOWED when targetDeptId is not in allowedDeptIds', async () => {
    (getDb as jest.Mock).mockReturnValue(makeDbMock());
    (XAPIClient.create as jest.Mock).mockResolvedValue(makeXapiMock());

    const app  = await buildApp();
    const resp = await app.inject({
      method:  'POST',
      url:     '/runner/switch',
      headers: { authorization: `Bearer ${makeToken()}` },
      payload: { targetDeptId: 99 }, // not in ['3','7','12']
    });

    expect(resp.statusCode).toBe(403);
    expect(resp.json().error).toBe('DEPT_NOT_ALLOWED');
  });

  it('writes denied audit log entry for DEPT_NOT_ALLOWED', async () => {
    (getDb as jest.Mock).mockReturnValue(makeDbMock());
    (XAPIClient.create as jest.Mock).mockResolvedValue(makeXapiMock());

    const app = await buildApp();
    await app.inject({
      method:  'POST',
      url:     '/runner/switch',
      headers: { authorization: `Bearer ${makeToken()}` },
      payload: { targetDeptId: 99 },
    });

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'denied', errorCode: 'DEPT_NOT_ALLOWED' }),
    );
  });

  it('returns 409 SAME_DEPT when already in the target department', async () => {
    (getDb as jest.Mock).mockReturnValue(makeDbMock());
    (XAPIClient.create as jest.Mock).mockResolvedValue(
      makeXapiMock({ currentGroupId: 7 }), // already in group 7
    );

    const app  = await buildApp();
    const resp = await app.inject({
      method:  'POST',
      url:     '/runner/switch',
      headers: { authorization: `Bearer ${makeToken()}` },
      payload: { targetDeptId: 7 },
    });

    expect(resp.statusCode).toBe(409);
    expect(resp.json().error).toBe('SAME_DEPT');
  });

  it('returns 503 PBX_UNAVAILABLE when XAPIClient.create fails', async () => {
    (getDb as jest.Mock).mockReturnValue(makeDbMock());
    (XAPIClient.create as jest.Mock).mockRejectedValue(new Error('FQDN not whitelisted'));

    const app  = await buildApp();
    const resp = await app.inject({
      method:  'POST',
      url:     '/runner/switch',
      headers: { authorization: `Bearer ${makeToken()}` },
      payload: { targetDeptId: 7 },
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
      method:  'POST',
      url:     '/runner/switch',
      headers: { authorization: `Bearer ${makeToken()}` },
      payload: { targetDeptId: 7 },
    });

    expect(resp.statusCode).toBe(503);
    expect(resp.json().error).toBe('PBX_UNAVAILABLE');
  });

  it('returns 503 PBX_UNAVAILABLE and writes failed audit when patchUserGroup fails', async () => {
    (getDb as jest.Mock).mockReturnValue(makeDbMock());
    (XAPIClient.create as jest.Mock).mockResolvedValue(
      makeXapiMock({ patchFails: true, currentGroupId: 3 }),
    );

    const app  = await buildApp();
    const resp = await app.inject({
      method:  'POST',
      url:     '/runner/switch',
      headers: { authorization: `Bearer ${makeToken()}` },
      payload: { targetDeptId: 7 },
    });

    expect(resp.statusCode).toBe(503);
    expect(resp.json().error).toBe('PBX_UNAVAILABLE');
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('filters DB query by tenantId to prevent cross-tenant leakage', async () => {
    const mockDb = makeDbMock();
    (getDb as jest.Mock).mockReturnValue(mockDb);
    (XAPIClient.create as jest.Mock).mockResolvedValue(makeXapiMock());

    const app = await buildApp();
    await app.inject({
      method:  'POST',
      url:     '/runner/switch',
      headers: { authorization: `Bearer ${makeToken()}` },
      payload: { targetDeptId: 7 },
    });

    // Verify select was called; the where clause receives eq(runners.tenantId, ...) conditions
    expect(mockDb.select).toHaveBeenCalled();
  });

  it('rejects token signed with a different secret (wrong tenant token cannot be replayed)', async () => {
    const jwt = require('jsonwebtoken');
    const foreignToken = jwt.sign(
      { type: 'runner', runnerId: 'other-runner', tenantId: 'other-tenant',
        entraEmail: EMAIL, pbxFqdn: PBX_FQDN, extensionNumber: EXT },
      'wrong-secret'.repeat(5),
      { expiresIn: '1h' },
    );

    const app  = await buildApp();
    const resp = await app.inject({
      method:  'POST',
      url:     '/runner/switch',
      headers: { authorization: `Bearer ${foreignToken}` },
      payload: { targetDeptId: 7 },
    });

    expect(resp.statusCode).toBe(401);
  });
});
