/**
 * tests/routes/setup.test.ts
 *
 * Unit tests for setup wizard routes — validation layer only.
 * DB, email, and PBX calls are mocked out.
 */

import Fastify from 'fastify';
import { setupRoutes } from '../../src/routes/setup';

// Mock DB layer
const mockSelect = jest.fn().mockReturnThis();
const mockFrom = jest.fn().mockReturnThis();
const mockWhere = jest.fn().mockReturnThis();
const mockLimit = jest.fn().mockResolvedValue([]);
const mockInsert = jest.fn().mockReturnThis();
const mockValues = jest.fn().mockReturnThis();
const mockReturning = jest.fn().mockResolvedValue([{ id: 'test-id', name: 'Test' }]);
const mockUpdate = jest.fn().mockReturnThis();
const mockSet = jest.fn().mockReturnThis();
const mockOrderBy = jest.fn().mockResolvedValue([]);

jest.mock('../../src/db/index', () => ({
  getDb: jest.fn().mockReturnValue({
    select: mockSelect,
    from: mockFrom,
    where: mockWhere,
    limit: mockLimit,
    insert: mockInsert,
    values: mockValues,
    returning: mockReturning,
    update: mockUpdate,
    set: mockSet,
    orderBy: mockOrderBy,
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

  it('returns 400 for empty extensionNumbers', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/setup/runners',
      headers: { authorization: 'Bearer mock-token' },
      payload: { extensionNumbers: [] },
    });
    expect(resp.statusCode).toBe(400);
  });

  it('returns 400 for missing body', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/setup/runners',
      headers: { authorization: 'Bearer mock-token' },
      payload: {},
    });
    expect(resp.statusCode).toBe(400);
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

  it('returns 400 for invalid mode', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/setup/invite',
      headers: { authorization: 'Bearer mock-token' },
      payload: { mode: 'invalid' },
    });
    expect(resp.statusCode).toBe(400);
  });
});
