/**
 * tests/security/security.test.ts
 *
 * Coverage:
 *   1. Non-whitelisted FQDN rejected before any network call
 *   2. Malformed FQDN rejected by regex (validateFqdn)
 *   3. SQL injection attempt in extension number rejected by Zod
 *   4. CORS rejects requests from unknown origins
 *   5. Security / rate-limit headers present on all responses
 */

// ── Module mocks (hoisted before imports by Jest) ─────────────────────────────
// config.ts calls process.exit(1) when env vars are absent; replace with a
// plain object so no real env is required during tests.

jest.mock('../../src/config', () => ({
  config: {
    NEXT_PUBLIC_APP_URL: 'https://runner.example.com',
    RATE_LIMIT_MAX:      10,
    RATE_LIMIT_WINDOW:   3600000,
    LOG_LEVEL:           'silent',
    PORT:                3001,
    NODE_ENV:            'test',
    JWT_SECRET:          'a'.repeat(64),
    JWT_EXPIRES_IN:      '1h',
  },
}));

// validateFqdn does a dynamic import('../db/index.js') — mock the DB so tests
// stay fully offline.  The mock returns an empty whitelist by default so any
// FQDN that passes the regex pre-check still fails the whitelist check.
jest.mock('../../src/db/index', () => ({
  getDb: jest.fn(() => ({
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]), // no rows → not whitelisted
      }),
    }),
  })),
  schema: {
    pbxCredentials: {
      pbxFqdn:  'pbxFqdn_col',
      isActive: 'isActive_col',
    },
  },
}));

import Fastify from 'fastify';
import nock from 'nock';
import { XAPIClient, PBXUnavailableError } from '../../src/xapi/client';
import { validateFqdn, createRunnerSchema } from '../../src/utils/validate';
import { registerSecurity } from '../../src/middleware/security';
import { registerRateLimit } from '../../src/middleware/rateLimit';

// ── Shared test constants ──────────────────────────────────────────────────────

const ALLOWED_FQDN  = 'pbx.customer.com';
const ALLOWED_FQDNS = [ALLOWED_FQDN] as const;
const APP_URL       = 'https://runner.example.com';

const instantDelay  = jest.fn().mockResolvedValue(undefined);
const mockToken     = jest.fn().mockResolvedValue('test-token');

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(() => {
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

// ── 1. Non-whitelisted FQDN rejected before any network call ──────────────────

describe('FQDN whitelist (XAPIClient)', () => {
  it('throws PBXUnavailableError for an unregistered FQDN without making any HTTP call', () => {
    // No nock interceptors — any HTTP request would throw a nock error
    expect(
      () => new XAPIClient('attacker.evil.com', ALLOWED_FQDNS, mockToken, instantDelay),
    ).toThrow(PBXUnavailableError);

    expect(
      () => new XAPIClient('attacker.evil.com', ALLOWED_FQDNS, mockToken, instantDelay),
    ).toThrow("FQDN 'attacker.evil.com' is not registered in the PBX whitelist");

    // Confirm nock did not intercept any requests
    expect(nock.pendingMocks()).toHaveLength(0);
  });

  it('accepts a registered FQDN without any network call', () => {
    expect(
      () => new XAPIClient(ALLOWED_FQDN, ALLOWED_FQDNS, mockToken, instantDelay),
    ).not.toThrow();
  });
});

// ── 2. Malformed FQDN rejected by regex (validateFqdn) ───────────────────────
// The regex check runs before any DB call, so these tests stay offline.

describe('validateFqdn — regex pre-check', () => {
  it.each([
    ['empty string',            ''],
    ['no TLD',                  'nodot'],
    ['TLD too short (1 char)',  'pbx.a'],
    ['uppercase letters',       'PBX.Customer.Com'],
    ['path injection',          'pbx.customer.com/evil'],
    ['query string injection',  'pbx.customer.com?x=1'],
    ['protocol prefix',         'https://pbx.customer.com'],
    ['IP address',              '192.168.1.1'],
    ['leading dot',             '.pbx.customer.com'],
    ['trailing dot',            'pbx.customer.com.'],
    ['null byte',               'pbx.customer.com\x00evil'],
    ['at sign',                 'user@pbx.customer.com'],
  ])('returns false for %s (%j)', async (_label, fqdn) => {
    const result = await validateFqdn(fqdn);
    expect(result).toBe(false);
  });

  it('returns false for a valid-format FQDN not in the whitelist (DB returns no rows)', async () => {
    // getDb mock returns empty rows by default -> not whitelisted
    const result = await validateFqdn('valid.but-unknown.org');
    expect(result).toBe(false);
  });
});

// ── 3. SQL injection in extension number rejected by Zod ─────────────────────

describe('createRunnerSchema — extension SQL injection prevention', () => {
  it.each([
    ["1; DROP TABLE runners;--"],
    ["' OR '1'='1"],
    ["1 UNION SELECT * FROM tenants"],
    ["<script>alert(1)</script>"],
    ["../../../etc/passwd"],
    ["${7*7}"],
  ])('rejects extension containing injection payload: %j', (malicious) => {
    const result = createRunnerSchema.safeParse({
      email:          'runner@example.com',
      extension:      malicious,
      pbxId:          '00000000-0000-0000-0000-000000000001',
      allowedDeptIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid numeric extension', () => {
    const result = createRunnerSchema.safeParse({
      email:          'runner@example.com',
      extension:      '1234',
      pbxId:          '00000000-0000-0000-0000-000000000001',
      allowedDeptIds: [],
    });
    expect(result.success).toBe(true);
  });
});

// ── 4. CORS rejects requests from unknown origins ─────────────────────────────
// NOTE: registerSecurity is called as a plain function (not via fastify.register)
// so that the onRequest / onSend hooks are registered at the ROOT scope and fire
// for every route in the app, not just routes inside an encapsulated child plugin.

describe('CORS enforcement (registerSecurity)', () => {
  async function buildApp() {
    const app = Fastify({ logger: false });
    await registerSecurity(app);           // direct call — root-level hooks
    app.get('/ping', async () => ({ ok: true }));
    await app.ready();
    return app;
  }

  it('does NOT echo Access-Control-Allow-Origin for an unknown origin', async () => {
    const app  = await buildApp();
    const resp = await app.inject({
      method:  'GET',
      url:     '/ping',
      headers: { origin: 'https://evil.attacker.com' },
    });

    expect(resp.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sets Access-Control-Allow-Origin for the allowed APP_URL origin', async () => {
    const app  = await buildApp();
    const resp = await app.inject({
      method:  'GET',
      url:     '/ping',
      headers: { origin: APP_URL },
    });

    expect(resp.headers['access-control-allow-origin']).toBe(APP_URL);
  });

  it('returns 204 for OPTIONS preflight from allowed origin with CORS headers', async () => {
    const app  = await buildApp();
    const resp = await app.inject({
      method:  'OPTIONS',
      url:     '/ping',
      headers: {
        origin:                          APP_URL,
        'access-control-request-method': 'POST',
      },
    });

    expect(resp.statusCode).toBe(204);
    expect(resp.headers['access-control-allow-origin']).toBe(APP_URL);
    expect(resp.headers['access-control-allow-methods']).toContain('POST');
  });

  it('returns 204 for OPTIONS preflight from unknown origin but omits ACAO header', async () => {
    const app  = await buildApp();
    const resp = await app.inject({
      method:  'OPTIONS',
      url:     '/ping',
      headers: {
        origin:                          'https://evil.attacker.com',
        'access-control-request-method': 'POST',
      },
    });

    expect(resp.statusCode).toBe(204);
    expect(resp.headers['access-control-allow-origin']).toBeUndefined();
  });
});

// ── 5. Security and rate-limit headers present on all responses ───────────────

describe('Security headers on every response', () => {
  async function buildApp() {
    const app = Fastify({ logger: false });
    await registerSecurity(app);     // direct call — root-level hooks
    await registerRateLimit(app);
    app.get('/ping', async () => ({ ok: true }));
    await app.ready();
    return app;
  }

  it('sets HSTS header', async () => {
    const app  = await buildApp();
    const resp = await app.inject({ method: 'GET', url: '/ping' });
    expect(resp.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
  });

  it('sets CSP header', async () => {
    const app  = await buildApp();
    const resp = await app.inject({ method: 'GET', url: '/ping' });
    expect(resp.headers['content-security-policy']).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  });

  it('sets X-Frame-Options: DENY', async () => {
    const app  = await buildApp();
    const resp = await app.inject({ method: 'GET', url: '/ping' });
    expect(resp.headers['x-frame-options']).toBe('DENY');
  });

  it('sets X-Content-Type-Options: nosniff', async () => {
    const app  = await buildApp();
    const resp = await app.inject({ method: 'GET', url: '/ping' });
    expect(resp.headers['x-content-type-options']).toBe('nosniff');
  });

  it('omits rate-limit headers for allowListed routes', async () => {
    const app  = await buildApp();
    const resp = await app.inject({ method: 'GET', url: '/ping' });
    // GET /ping is exempt from rate limiting (allowList returns true for non-switch routes)
    // so x-ratelimit-* headers should NOT be present
    expect(resp.headers['x-ratelimit-limit']).toBeUndefined();
    expect(resp.headers['x-ratelimit-remaining']).toBeUndefined();
  });
});
