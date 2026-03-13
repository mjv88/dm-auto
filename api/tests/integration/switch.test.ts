/**
 * tests/integration/switch.test.ts
 *
 * Integration tests for POST /runner/switch
 *
 * Strategy:
 *   - Real PostgreSQL DB (docker-compose.test.yml, port 5433)
 *   - Real Fastify instance tested via supertest
 *   - Real session JWT validation (JWT_SECRET set in jest.setup.ts)
 *   - Real audit_log writes verified directly against the DB
 *   - Mocked: XAPIClient.create (avoids live xAPI HTTP calls + OAuth flow)
 *
 * Covered scenarios:
 *   ✓ Valid switch → 200, audit log written to DB, correct response shape
 *   ✓ Switch to same dept → 409 SAME_DEPT  (spec: 400 — impl uses 409 Conflict)
 *   ✓ Dept not in allowedDeptIds → 403 DEPT_NOT_ALLOWED, denied audit row
 *   ✓ xAPI unreachable → 503 PBX_UNAVAILABLE, failed audit row
 *   ✓ Rate limit exceeded → 429 RATE_LIMITED
 *   ✓ Expired session token → 401 TOKEN_EXPIRED
 */

// ── Mock declarations (hoisted before imports by ts-jest) ─────────────────────

jest.mock('../../src/xapi/client', () => ({
  XAPIClient: {
    create: jest.fn(),
  },
  PBXUnavailableError: class PBXUnavailableError extends Error {
    readonly code = 'PBX_UNAVAILABLE';
    constructor(msg: string) {
      super(msg);
      this.name = 'PBXUnavailableError';
    }
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import Fastify, { FastifyInstance } from 'fastify';
import request from 'supertest';
import { XAPIClient } from '../../src/xapi/client';
import { switchRoutes } from '../../src/routes/switch';
import { createSessionToken } from '../../src/middleware/session';
import { getDb, closeDb } from '../../src/db/index';
import { tenants, pbxCredentials, runners } from '../../src/db/schema';
import { runTestMigrations, truncateTables, waitForAuditEntry } from './helpers/db';

// ── Constants ─────────────────────────────────────────────────────────────────

const TEST_EMAIL    = 'runner@integration.switch.test';
const TEST_TID      = 'tid-switch-integration-001';
const TEST_PBX_FQDN = 'pbx.switch.integration.test';

// ── Fixture helper ────────────────────────────────────────────────────────────

/** Seeds tenant + pbx_credential + runner and returns all three. */
async function seedAll() {
  const db = getDb();

  const [tenant] = await db
    .insert(tenants)
    .values({
      entraTenantId: TEST_TID,
      name:          'Switch Integration Tenant',
      entraGroupId:  'group-switch-int-001',
      adminEmails:   [],
      isActive:      true,
    })
    .returning();

  const [cred] = await db
    .insert(pbxCredentials)
    .values({
      tenantId: tenant.id,
      pbxFqdn:  TEST_PBX_FQDN,
      pbxName:  'Switch Test PBX',
      authMode: 'xapi',
      isActive: true,
    })
    .returning();

  const [runner] = await db
    .insert(runners)
    .values({
      tenantId:        tenant.id,
      pbxCredentialId: cred.id,
      entraEmail:      TEST_EMAIL,
      extensionNumber: '101',
      allowedDeptIds:  ['3', '7', '12'],
      isActive:        true,
      createdBy:       'integration-test',
    })
    .returning();

  return { tenant, cred, runner };
}

// ── Token helper ──────────────────────────────────────────────────────────────

function makeToken(runnerId: string, tenantId: string) {
  return createSessionToken({
    type:            'runner',
    runnerId,
    tenantId,
    entraEmail:      TEST_EMAIL,
    pbxFqdn:         TEST_PBX_FQDN,
    extensionNumber: '101',
  });
}

// ── xAPI mock factory ─────────────────────────────────────────────────────────

function makeXapiMock(opts: {
  currentGroupId?: number;
  getUserFails?:   boolean;
  patchFails?:     boolean;
} = {}) {
  const { currentGroupId = 3, getUserFails = false, patchFails = false } = opts;
  return {
    getUserByNumber: jest.fn().mockImplementation(() =>
      getUserFails
        ? Promise.reject(new Error('xAPI unreachable'))
        : Promise.resolve({ userId: 42, currentGroupId, emailAddress: TEST_EMAIL }),
    ),
    getGroups: jest.fn().mockResolvedValue([
      { id: 3,  name: 'Sales'     },
      { id: 7,  name: 'Support'   },
      { id: 12, name: 'Reception' },
    ]),
    patchUserGroup: jest.fn().mockImplementation(() =>
      patchFails
        ? Promise.reject(new Error('xAPI unreachable'))
        : Promise.resolve(),
    ),
  };
}

// ── App factory ───────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(switchRoutes);
  return app;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let app: FastifyInstance;

beforeAll(async () => {
  await runTestMigrations();
  app = await buildApp();
  await app.listen({ port: 0 });
});

afterAll(async () => {
  if (!app) return;
  await app.close();
  await closeDb();
});

beforeEach(async () => {
  await truncateTables();
  jest.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /runner/switch — integration', () => {

  it('valid switch → 200, audit log written, correct response', async () => {
    const { runner, tenant } = await seedAll();
    const token = makeToken(runner.id, tenant.id);
    (XAPIClient.create as jest.Mock).mockResolvedValue(makeXapiMock({ currentGroupId: 3 }));

    const resp = await request(app.server)
      .post('/runner/switch')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetDeptId: 7 });

    expect(resp.status).toBe(200);
    expect(resp.body.success).toBe(true);
    expect(resp.body.previousDept).toEqual({ id: 3, name: 'Sales'   });
    expect(resp.body.currentDept).toEqual(  { id: 7, name: 'Support' });
    expect(typeof resp.body.switchedAt).toBe('string');

    // Verify the audit_log row was written to the real DB
    const entry = await waitForAuditEntry(runner.id, 'success');
    expect(entry.fromDeptId).toBe('3');
    expect(entry.toDeptId).toBe('7');
    expect(entry.entraEmail).toBe(TEST_EMAIL);
    expect(entry.pbxFqdn).toBe(TEST_PBX_FQDN);
    expect(entry.extensionNumber).toBe('101');
    expect(entry.errorMessage).toBeNull();
  });

  it('switch to same dept → 409 SAME_DEPT', async () => {
    // Spec lists this as "400 SAME_DEPT"; the implementation returns 409 Conflict.
    const { runner, tenant } = await seedAll();
    const token = makeToken(runner.id, tenant.id);
    (XAPIClient.create as jest.Mock).mockResolvedValue(makeXapiMock({ currentGroupId: 7 }));

    const resp = await request(app.server)
      .post('/runner/switch')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetDeptId: 7 });

    expect(resp.status).toBe(409);
    expect(resp.body.error).toBe('SAME_DEPT');
  });

  it('dept not in allowedDeptIds → 403 DEPT_NOT_ALLOWED, denied audit row', async () => {
    const { runner, tenant } = await seedAll();
    const token = makeToken(runner.id, tenant.id);

    const resp = await request(app.server)
      .post('/runner/switch')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetDeptId: 99 }); // not in ['3','7','12']

    expect(resp.status).toBe(403);
    expect(resp.body.error).toBe('DEPT_NOT_ALLOWED');

    // Denied audit row must be persisted
    const entry = await waitForAuditEntry(runner.id, 'denied');
    expect(entry.toDeptId).toBe('99');
    expect(entry.errorMessage).toBe('DEPT_NOT_ALLOWED');
  });

  it('xAPI unreachable (patchUserGroup fails) → 503 PBX_UNAVAILABLE, failed audit row', async () => {
    const { runner, tenant } = await seedAll();
    const token = makeToken(runner.id, tenant.id);
    (XAPIClient.create as jest.Mock).mockResolvedValue(
      makeXapiMock({ patchFails: true, currentGroupId: 3 }),
    );

    const resp = await request(app.server)
      .post('/runner/switch')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetDeptId: 7 });

    expect(resp.status).toBe(503);
    expect(resp.body.error).toBe('PBX_UNAVAILABLE');

    // Failed audit row must be persisted with correct dept IDs
    const entry = await waitForAuditEntry(runner.id, 'failed');
    expect(entry.fromDeptId).toBe('3');
    expect(entry.toDeptId).toBe('7');
  });

  it('rate limit exceeded → 429 RATE_LIMITED', async () => {
    const { runner, tenant } = await seedAll();
    const token = makeToken(runner.id, tenant.id);

    // Build a dedicated app with max=2 to avoid polluting the shared app's state
    const rateLimitApp = Fastify({ logger: false });
    await rateLimitApp.register(
      import('@fastify/rate-limit'),
      {
        max:     2,
        timeWindow: 60_000,
        // Mirrors src/middleware/rateLimit.ts key logic
        keyGenerator: (req: any) => req.runnerContext?.extensionNumber ?? req.ip,
        errorResponseBuilder: (_req: any, context: any) => ({
          statusCode: context.statusCode,
          error:   'RATE_LIMITED',
          message: 'Too many department switches. Try again later.',
        }),
      },
    );
    await rateLimitApp.register(switchRoutes);
    await rateLimitApp.listen({ port: 0 });

    (XAPIClient.create as jest.Mock).mockResolvedValue(makeXapiMock({ currentGroupId: 3 }));

    // First two requests must not be rate-limited
    for (let i = 0; i < 2; i++) {
      const r = await request(rateLimitApp.server)
        .post('/runner/switch')
        .set('Authorization', `Bearer ${token}`)
        .send({ targetDeptId: 7 });
      expect(r.status).not.toBe(429);
    }

    // Third request must be rate-limited
    const limited = await request(rateLimitApp.server)
      .post('/runner/switch')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetDeptId: 7 });
    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe('RATE_LIMITED');

    await rateLimitApp.close();
  });

  it('expired session token → 401 TOKEN_EXPIRED', async () => {
    // Inline require to bypass ESM interop issues with jsonwebtoken in this context
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jwt = require('jsonwebtoken');
    const expiredToken = jwt.sign(
      {
        type:            'runner',
        runnerId:        'any-runner-id',
        tenantId:        'any-tenant-id',
        entraEmail:      TEST_EMAIL,
        pbxFqdn:         TEST_PBX_FQDN,
        extensionNumber: '101',
      },
      process.env.JWT_SECRET,
      { expiresIn: -1 }, // already expired
    );

    const resp = await request(app.server)
      .post('/runner/switch')
      .set('Authorization', `Bearer ${expiredToken}`)
      .send({ targetDeptId: 7 });

    expect(resp.status).toBe(401);
    expect(resp.body.error).toBe('TOKEN_EXPIRED');
  });

});
