/**
 * tests/routes/setup.test.ts
 *
 * Unit tests for setup wizard routes — validation layer only.
 * DB, email, and PBX calls are mocked out.
 */

import Fastify from 'fastify';
import { setupRoutes } from '../../src/routes/setup';

// Mock DB layer (inline — jest.mock is hoisted before variable declarations)
jest.mock('../../src/db/index', () => ({
  getDb: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([{ id: 'test-id', name: 'Test' }]),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockResolvedValue([]),
  }),
}));

// Mock session
jest.mock('../../src/middleware/session', () => ({
  createSessionToken: jest.fn().mockReturnValue('mock-session-token'),
  validateSessionToken: jest.fn().mockReturnValue({
    type: 'runner',
    runnerId: 'user-1',
    tenantId: '',
    entraEmail: '',
    email: 'admin@test.com',
    emailVerified: true,
    pbxFqdn: '',
    extensionNumber: '',
  }),
}));

// Mock setupAuth middleware — attach setupContext directly
jest.mock('../../src/middleware/setupAuth', () => ({
  setupAuthenticate: jest.fn().mockImplementation(async (request: any) => {
    request.setupContext = {
      userId: 'user-1',
      email: 'admin@test.com',
      tenantId: null,
    };
  }),
}));

// Mock email service
jest.mock('../../src/utils/email', () => ({
  sendInviteEmail: jest.fn(),
}));

// Mock encrypt
jest.mock('../../src/utils/encrypt', () => ({
  encrypt: jest.fn((v: string) => `enc:${v}`),
}));

// Mock PBX connectivity
jest.mock('../../src/utils/pbx', () => ({
  validatePbxConnectivity: jest.fn(),
}));

// Mock XAPIClient
jest.mock('../../src/xapi/client', () => ({
  XAPIClient: {
    create: jest.fn().mockResolvedValue({
      getGroups: jest.fn().mockResolvedValue([]),
      getAllUsers: jest.fn().mockResolvedValue([]),
    }),
  },
}));

// Mock config
jest.mock('../../src/config', () => ({
  config: {
    JWT_SECRET: 'test-secret',
    JWT_EXPIRES_IN: '8h',
  },
}));

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /setup/status', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(setupRoutes);
    await app.ready();
  });
  afterAll(() => app.close());

  it('returns status with hasCompany false when no tenant', async () => {
    const resp = await app.inject({
      method: 'GET',
      url: '/setup/status',
      headers: { authorization: 'Bearer mock-token' },
    });
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.hasCompany).toBe(false);
    expect(body.hasPbx).toBe(false);
    expect(body.hasRunners).toBe(false);
    expect(body.runnerCount).toBe(0);
  });
});

describe('POST /setup/company', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(setupRoutes);
    await app.ready();
  });
  afterAll(() => app.close());

  it('returns 400 for missing name', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/setup/company',
      headers: { authorization: 'Bearer mock-token' },
      payload: {},
    });
    expect(resp.statusCode).toBe(400);
  });

  it('returns 400 for empty name', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/setup/company',
      headers: { authorization: 'Bearer mock-token' },
      payload: { name: '' },
    });
    expect(resp.statusCode).toBe(400);
  });
});

describe('POST /setup/runners', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(setupRoutes);
    await app.ready();
  });
  afterAll(() => app.close());

  it('returns 403 when user has no tenant', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/setup/runners',
      headers: { authorization: 'Bearer mock-token' },
      payload: { extensionNumbers: ['100'] },
    });
    expect(resp.statusCode).toBe(403);
  });
});

describe('POST /setup/invite', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(setupRoutes);
    await app.ready();
  });
  afterAll(() => app.close());

  it('returns 403 when user has no tenant', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/setup/invite',
      headers: { authorization: 'Bearer mock-token' },
      payload: { mode: 'link' },
    });
    expect(resp.statusCode).toBe(403);
  });
});
