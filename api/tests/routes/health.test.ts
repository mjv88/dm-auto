/**
 * tests/routes/health.test.ts
 *
 * Unit tests for GET /health
 */

import Fastify from 'fastify';
import { healthRoutes } from '../../src/routes/health';

// ── Mock getDb ─────────────────────────────────────────────────────────────────

jest.mock('../../src/db/index', () => ({
  getDb: jest.fn(),
}));

import { getDb } from '../../src/db/index';

// ── Helpers ────────────────────────────────────────────────────────────────────

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(healthRoutes);
  return app;
}

function makeDbMock(shouldFail = false) {
  return {
    execute: jest.fn().mockImplementation(() =>
      shouldFail
        ? Promise.reject(new Error('Connection refused'))
        : Promise.resolve([{ '?column?': 1 }]),
    ),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns status=ok when DB is reachable', async () => {
    (getDb as jest.Mock).mockReturnValue(makeDbMock(false));

    const app = await buildApp();
    const resp = await app.inject({ method: 'GET', url: '/health' });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('connected');
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.version).toBe('string');
  });

  it('returns status=degraded when DB is unreachable', async () => {
    (getDb as jest.Mock).mockReturnValue(makeDbMock(true));

    const app = await buildApp();
    const resp = await app.inject({ method: 'GET', url: '/health' });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.status).toBe('degraded');
    expect(body.db).toBe('disconnected');
  });

  it('returns status=degraded when DB check times out', async () => {
    // Simulate a DB query that never resolves (timeout scenario)
    (getDb as jest.Mock).mockReturnValue({
      execute: jest.fn().mockReturnValue(new Promise(() => { /* never resolves */ })),
    });

    const app = await buildApp();
    const resp = await app.inject({ method: 'GET', url: '/health' });

    // The route has a 1 s timeout; jest test timeout is 30 s so this should resolve
    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.status).toBe('degraded');
    expect(body.db).toBe('disconnected');
  }, 5000);

  it('does not require authentication', async () => {
    (getDb as jest.Mock).mockReturnValue(makeDbMock(false));

    const app = await buildApp();
    const resp = await app.inject({
      method:  'GET',
      url:     '/health',
      // No Authorization header
    });

    expect(resp.statusCode).toBe(200);
  });
});
