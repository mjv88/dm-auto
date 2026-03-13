/**
 * tests/integration/auth.test.ts
 *
 * Integration tests for POST /runner/auth
 *
 * Strategy:
 *   - Real PostgreSQL DB (docker-compose.test.yml, port 5433)
 *   - Real Fastify instance, tested via supertest
 *   - Mocked: validateMicrosoftToken (skips Microsoft JWKS)
 *   - Mocked: checkEntraGroup       (skips Microsoft Graph)
 *
 * Covered scenarios:
 *   ✓ Valid runner, single PBX → direct mode response
 *   ✓ Valid runner, multi-PBX, no fqdn param → select mode response
 *   ✓ Valid runner, multi-PBX, fqdn param → direct mode response
 *   ✓ Not in Entra group → 403 NOT_IN_RUNNERS_GROUP  (spec: NOT_A_RUNNER)
 *   ✓ In Entra group, no DB runner row → 403 RUNNER_NOT_FOUND  (spec: RUNNER_NOT_CONFIGURED)
 *   ✓ FQDN param doesn't match any runner → 403 PBX_NOT_AUTHORIZED
 */

// ── Jest mock declarations (hoisted before imports) ───────────────────────────

jest.mock('../../src/middleware/authenticate', () => ({
  ...jest.requireActual('../../src/middleware/authenticate'),
  validateMicrosoftToken: jest.fn(),
}));

jest.mock('../../src/entra/groupCheck', () => ({
  checkEntraGroup: jest.fn(),
  clearGroupCheckCache: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import Fastify, { FastifyInstance } from 'fastify';
import request from 'supertest';
import { validateMicrosoftToken } from '../../src/middleware/authenticate';
import { checkEntraGroup } from '../../src/entra/groupCheck';
import { authRoutes } from '../../src/routes/auth';
import { getDb, closeDb } from '../../src/db/index';
import { tenants, pbxCredentials, runners } from '../../src/db/schema';
import { runTestMigrations, truncateTables } from './helpers/db';

// ── Test constants ────────────────────────────────────────────────────────────

const TEST_EMAIL     = 'runner@integration.auth.test';
const TEST_TID       = 'tid-auth-integration-001';
const TEST_OID       = 'oid-auth-integration-001';
const TEST_GROUP_ID  = 'group-auth-integration-001';
const TEST_PBX_FQDN  = 'pbx.auth.integration.test';
const TEST_PBX2_FQDN = 'pbx2.auth.integration.test';
const VALID_ID_TOKEN = 'x'.repeat(200); // satisfies min(100) schema validation

// ── Fixture helpers ───────────────────────────────────────────────────────────

async function seedTenant() {
  const db = getDb();
  const [tenant] = await db
    .insert(tenants)
    .values({
      entraTenantId: TEST_TID,
      name:          'Auth Integration Tenant',
      entraGroupId:  TEST_GROUP_ID,
      adminEmails:   [],
      isActive:      true,
    })
    .returning();
  return tenant;
}

async function seedPbx(tenantId: string, fqdn: string, name: string) {
  const db = getDb();
  const [cred] = await db
    .insert(pbxCredentials)
    .values({
      tenantId,
      pbxFqdn:  fqdn,
      pbxName:  name,
      authMode: 'xapi',
      isActive: true,
    })
    .returning();
  return cred;
}

async function seedRunner(
  tenantId: string,
  pbxCredentialId: string,
  email = TEST_EMAIL,
) {
  const db = getDb();
  const [runner] = await db
    .insert(runners)
    .values({
      tenantId,
      pbxCredentialId,
      entraEmail:      email,
      extensionNumber: '101',
      allowedDeptIds:  ['3', '7'],
      isActive:        true,
      createdBy:       'integration-test',
    })
    .returning();
  return runner;
}

// ── App factory ───────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(authRoutes);
  return app;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let app: FastifyInstance;

beforeAll(async () => {
  await runTestMigrations();
  app = await buildApp();
  await app.listen({ port: 0 }); // supertest uses app.server after listen
});

afterAll(async () => {
  if (!app) return;
  await app.close();
  await closeDb();
});

beforeEach(async () => {
  await truncateTables();
  jest.clearAllMocks();

  // Default: valid Microsoft token resolving to our test user
  (validateMicrosoftToken as jest.Mock).mockResolvedValue({
    email: TEST_EMAIL,
    tid:   TEST_TID,
    oid:   TEST_OID,
    name:  'Integration Test Runner',
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /runner/auth — integration', () => {

  it('valid runner, single PBX → direct mode response', async () => {
    const tenant = await seedTenant();
    const cred   = await seedPbx(tenant.id, TEST_PBX_FQDN, 'Primary PBX');
    await seedRunner(tenant.id, cred.id);
    (checkEntraGroup as jest.Mock).mockResolvedValue(true);

    const resp = await request(app.server)
      .post('/runner/auth')
      .send({ idToken: VALID_ID_TOKEN });

    expect(resp.status).toBe(200);
    expect(resp.body.mode).toBe('direct');
    expect(resp.body.runner).toMatchObject({
      email:           TEST_EMAIL,
      pbxFqdn:         TEST_PBX_FQDN,
      extensionNumber: '101',
    });
    expect(typeof resp.body.sessionToken).toBe('string');
    expect(resp.body.sessionToken.length).toBeGreaterThan(20);
  });

  it('valid runner, multi-PBX, no fqdn param → select mode response', async () => {
    const tenant = await seedTenant();
    const cred1  = await seedPbx(tenant.id, TEST_PBX_FQDN,  'Primary PBX');
    const cred2  = await seedPbx(tenant.id, TEST_PBX2_FQDN, 'Secondary PBX');
    await seedRunner(tenant.id, cred1.id);
    await seedRunner(tenant.id, cred2.id);
    (checkEntraGroup as jest.Mock).mockResolvedValue(true);

    const resp = await request(app.server)
      .post('/runner/auth')
      .send({ idToken: VALID_ID_TOKEN });

    expect(resp.status).toBe(200);
    expect(resp.body.mode).toBe('select');
    expect(Array.isArray(resp.body.options)).toBe(true);
    expect(resp.body.options).toHaveLength(2);
    const fqdns: string[] = resp.body.options.map((o: { pbxFqdn: string }) => o.pbxFqdn);
    expect(fqdns).toContain(TEST_PBX_FQDN);
    expect(fqdns).toContain(TEST_PBX2_FQDN);
    // No sessionToken in select mode
    expect(resp.body.sessionToken).toBeUndefined();
  });

  it('valid runner, multi-PBX, fqdn param → direct mode response', async () => {
    const tenant = await seedTenant();
    const cred1  = await seedPbx(tenant.id, TEST_PBX_FQDN,  'Primary PBX');
    const cred2  = await seedPbx(tenant.id, TEST_PBX2_FQDN, 'Secondary PBX');
    await seedRunner(tenant.id, cred1.id);
    await seedRunner(tenant.id, cred2.id);
    (checkEntraGroup as jest.Mock).mockResolvedValue(true);

    const resp = await request(app.server)
      .post('/runner/auth')
      .send({ idToken: VALID_ID_TOKEN, pbxFqdn: TEST_PBX_FQDN });

    expect(resp.status).toBe(200);
    expect(resp.body.mode).toBe('direct');
    expect(resp.body.runner.pbxFqdn).toBe(TEST_PBX_FQDN);
    expect(typeof resp.body.sessionToken).toBe('string');
  });

  it('not in Entra group → 403 NOT_IN_RUNNERS_GROUP', async () => {
    // Spec label: NOT_A_RUNNER — implementation code: NOT_IN_RUNNERS_GROUP
    const tenant = await seedTenant();
    const cred   = await seedPbx(tenant.id, TEST_PBX_FQDN, 'Primary PBX');
    await seedRunner(tenant.id, cred.id);
    (checkEntraGroup as jest.Mock).mockResolvedValue(false);

    const resp = await request(app.server)
      .post('/runner/auth')
      .send({ idToken: VALID_ID_TOKEN });

    expect(resp.status).toBe(403);
    expect(resp.body.error).toBe('NOT_IN_RUNNERS_GROUP');
  });

  it('in Entra group, no DB runner row → 403 RUNNER_NOT_FOUND', async () => {
    // Spec label: RUNNER_NOT_CONFIGURED — implementation code: RUNNER_NOT_FOUND
    // Tenant exists but no runner row for this email
    await seedTenant();
    (checkEntraGroup as jest.Mock).mockResolvedValue(true);

    const resp = await request(app.server)
      .post('/runner/auth')
      .send({ idToken: VALID_ID_TOKEN });

    expect(resp.status).toBe(403);
    expect(resp.body.error).toBe('RUNNER_NOT_FOUND');
  });

  it('FQDN param does not match any registered runner → 403 PBX_NOT_AUTHORIZED', async () => {
    const tenant = await seedTenant();
    const cred   = await seedPbx(tenant.id, TEST_PBX_FQDN, 'Primary PBX');
    await seedRunner(tenant.id, cred.id);
    (checkEntraGroup as jest.Mock).mockResolvedValue(true);

    const resp = await request(app.server)
      .post('/runner/auth')
      .send({ idToken: VALID_ID_TOKEN, pbxFqdn: 'unknown.pbx.nowhere.test' });

    expect(resp.status).toBe(403);
    expect(resp.body.error).toBe('PBX_NOT_AUTHORIZED');
  });

});
