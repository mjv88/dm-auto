/**
 * tests/auth/session.test.ts
 *
 * Tests for createSessionToken / validateSessionToken.
 */

import { createSessionToken, validateSessionToken } from '../../src/middleware/session';
import type { UnifiedSession } from '../../src/middleware/session';

const TEST_SECRET = 'a'.repeat(64);

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.JWT_EXPIRES_IN = '1h';
});

afterAll(() => {
  delete process.env.JWT_SECRET;
  delete process.env.JWT_EXPIRES_IN;
});

const runnerSession: UnifiedSession = {
  type: 'session',
  userId: 'uuid-runner-0000',
  email: 'runner@example.com',
  role: 'runner',
  tenantId: 'uuid-tenant-0000',
  runnerId: 'uuid-runner-0000',
  emailVerified: true,
  pbxFqdn: 'pbx.example.com',
  extensionNumber: '101',
  entraEmail: 'runner@example.com',
  tid: null,
  oid: null,
};

const adminSession: UnifiedSession = {
  type: 'session',
  userId: 'uuid-admin-0000',
  email: 'admin@example.com',
  role: 'admin',
  tenantId: 'uuid-tenant-0000',
  runnerId: null,
  emailVerified: true,
  pbxFqdn: null,
  extensionNumber: null,
  entraEmail: 'admin@example.com',
  tid: 'tenant-id-0000',
  oid: 'oid-admin-0000',
};

describe('createSessionToken / validateSessionToken', () => {
  it('round-trips a runner session', () => {
    const token = createSessionToken(runnerSession);
    expect(typeof token).toBe('string');

    const decoded = validateSessionToken(token);
    expect(decoded.type).toBe('session');
    expect(decoded.runnerId).toBe(runnerSession.runnerId);
    expect(decoded.pbxFqdn).toBe(runnerSession.pbxFqdn);
    expect(decoded.email).toBe(runnerSession.email);
    expect(decoded.role).toBe('runner');
  });

  it('round-trips an admin session', () => {
    const token = createSessionToken(adminSession);
    const decoded = validateSessionToken(token);

    expect(decoded.type).toBe('session');
    expect(decoded.tid).toBe(adminSession.tid);
    expect(decoded.oid).toBe(adminSession.oid);
    expect(decoded.role).toBe('admin');
  });

  it('normalizes legacy runner tokens', () => {
    // Simulate a legacy token with type: 'runner'
    const jwt = require('jsonwebtoken');
    const legacyToken = jwt.sign(
      {
        type: 'runner',
        runnerId: 'uuid-runner-0000',
        tenantId: 'uuid-tenant-0000',
        entraEmail: 'runner@example.com',
        email: 'runner@example.com',
        emailVerified: true,
        pbxFqdn: 'pbx.example.com',
        extensionNumber: '101',
      },
      TEST_SECRET,
      { expiresIn: '1h' },
    );

    const decoded = validateSessionToken(legacyToken);
    expect(decoded.type).toBe('session');
    expect(decoded.role).toBe('runner');
    expect(decoded.runnerId).toBe('uuid-runner-0000');
    expect(decoded.pbxFqdn).toBe('pbx.example.com');
  });

  it('normalizes legacy admin tokens', () => {
    const jwt = require('jsonwebtoken');
    const legacyToken = jwt.sign(
      {
        type: 'admin',
        tenantId: 'uuid-tenant-0000',
        entraEmail: 'admin@example.com',
        tid: 'tenant-id-0000',
        oid: 'oid-admin-0000',
      },
      TEST_SECRET,
      { expiresIn: '1h' },
    );

    const decoded = validateSessionToken(legacyToken);
    expect(decoded.type).toBe('session');
    expect(decoded.role).toBe('admin');
    expect(decoded.tid).toBe('tenant-id-0000');
    expect(decoded.email).toBe('admin@example.com');
  });

  it('throws TOKEN_EXPIRED for an expired token', () => {
    // Create a token that expired in the past by temporarily setting a very short expiry
    process.env.JWT_EXPIRES_IN = '1ms';
    const token = createSessionToken(runnerSession);
    // Wait a tick for it to expire
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        process.env.JWT_EXPIRES_IN = '1h';
        expect(() => validateSessionToken(token)).toThrow(
          expect.objectContaining({ code: 'TOKEN_EXPIRED' }),
        );
        resolve();
      }, 50);
    });
  });

  it('throws for a tampered token', () => {
    const token = createSessionToken(runnerSession);
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(() => validateSessionToken(tampered)).toThrow();
  });
});
