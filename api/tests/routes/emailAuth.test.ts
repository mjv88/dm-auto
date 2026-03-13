/**
 * tests/routes/emailAuth.test.ts
 *
 * Unit tests for email/password auth routes — validation layer only.
 * DB and email calls are mocked out.
 */

import Fastify from 'fastify';
import { emailAuthRoutes } from '../../src/routes/emailAuth';

// Mock DB layer
jest.mock('../../src/db/index', () => ({
  getDb: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  }),
}));

// Mock email service
jest.mock('../../src/utils/email', () => ({
  sendVerificationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));

// Mock session
jest.mock('../../src/middleware/session', () => ({
  createSessionToken: jest.fn().mockReturnValue('mock-session-token'),
  validateSessionToken: jest.fn(),
}));

// Mock config
jest.mock('../../src/config', () => ({
  config: {
    BCRYPT_ROUNDS: 4, // low rounds for fast tests
    JWT_SECRET: 'test-secret',
    JWT_EXPIRES_IN: '8h',
  },
}));

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(emailAuthRoutes);
    await app.ready();
  });
  afterAll(() => app.close());

  it('returns 400 for invalid email', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'bad', password: 'Password1' },
    });
    expect(resp.statusCode).toBe(400);
  });

  it('returns 400 for weak password', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'user@test.com', password: 'weak' },
    });
    expect(resp.statusCode).toBe(400);
  });

  it('returns 400 for missing fields', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {},
    });
    expect(resp.statusCode).toBe(400);
  });
});

describe('POST /auth/login', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(emailAuthRoutes);
    await app.ready();
  });
  afterAll(() => app.close());

  it('returns 400 for missing fields', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'user@test.com' },
    });
    expect(resp.statusCode).toBe(400);
  });

  it('returns 400 for missing email', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { password: 'Password1' },
    });
    expect(resp.statusCode).toBe(400);
  });
});

describe('POST /auth/forgot-password', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(emailAuthRoutes);
    await app.ready();
  });
  afterAll(() => app.close());

  it('returns 400 for invalid email', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: 'not-an-email' },
    });
    expect(resp.statusCode).toBe(400);
  });
});

describe('POST /auth/reset-password', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(emailAuthRoutes);
    await app.ready();
  });
  afterAll(() => app.close());

  it('returns 400 for missing token', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { password: 'NewPassword1' },
    });
    expect(resp.statusCode).toBe(400);
  });

  it('returns 400 for weak new password', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: 'some-token', password: 'weak' },
    });
    expect(resp.statusCode).toBe(400);
  });
});

describe('POST /auth/verify-email', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(emailAuthRoutes);
    await app.ready();
  });
  afterAll(() => app.close());

  it('returns 400 for missing token', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      payload: {},
    });
    expect(resp.statusCode).toBe(400);
  });
});
