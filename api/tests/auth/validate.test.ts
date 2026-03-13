/**
 * tests/auth/validate.test.ts
 *
 * Tests for validateMicrosoftToken (Microsoft ID token validation).
 * All JWKS HTTP calls are intercepted by nock.
 * Real RSA keys are generated at runtime so signature validation is genuine.
 */

import { generateKeyPairSync } from 'crypto';
import jwt from 'jsonwebtoken';
import nock from 'nock';
import { validateMicrosoftToken } from '../../src/middleware/authenticate';

// ── Test RSA key pair (generated once per test run) ───────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const TEST_KID = 'test-kid-1';
const TEST_CLIENT_ID = 'test-client-id';
const TEST_TID = 'aaaabbbb-0000-1111-2222-ccccddddeeee';
const TEST_OID = 'oid-user-0000-1111-2222-333344445555';
const TEST_EMAIL = 'runner@customer.com';
const JWKS_HOST = 'https://login.microsoftonline.com';

/**
 * Builds a valid Microsoft-style ID token payload.
 * Uses the real RSA private key so JWKS validation passes.
 */
function makeIdToken(
  overrides: Partial<Record<string, unknown>> = {},
  jwtOptions: jwt.SignOptions = {},
): string {
  const payload = {
    aud: TEST_CLIENT_ID,
    iss: `https://login.microsoftonline.com/${TEST_TID}/v2.0`,
    tid: TEST_TID,
    oid: TEST_OID,
    email: TEST_EMAIL,
    name: 'Test Runner',
    ...overrides,
  };
  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    keyid: TEST_KID,
    expiresIn: '1h',
    ...jwtOptions,
  });
}

/**
 * Registers a nock interceptor for the common JWKS endpoint.
 * Converts the PEM public key to a JWK-style response.
 */
function mockJwks(): void {
  // jwks-rsa fetches keys as a JWKS JSON document
  // We serve a minimal stub with the RSA public key in PEM form via x5c
  // (jwks-rsa's getPublicKey() works with PEM directly when using the
  //  RsaSigningKey shape — we mock getSigningKey directly instead)
  nock(JWKS_HOST)
    .get('/common/discovery/v2.0/keys')
    .reply(200, {
      keys: [
        {
          kty: 'RSA',
          use: 'sig',
          kid: TEST_KID,
          // Provide PEM via x5c (base64-encoded DER)
          x5c: [
            publicKey
              .replace('-----BEGIN PUBLIC KEY-----', '')
              .replace('-----END PUBLIC KEY-----', '')
              .replace(/\n/g, ''),
          ],
        },
      ],
    });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(() => {
  process.env.ENTRA_CLIENT_ID = TEST_CLIENT_ID;
  nock.disableNetConnect();
});

afterAll(() => {
  nock.enableNetConnect();
  nock.cleanAll();
  delete process.env.ENTRA_CLIENT_ID;
});

beforeEach(() => {
  nock.cleanAll();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('validateMicrosoftToken', () => {
  it('returns { email, name, tid, oid } for a valid token', async () => {
    // Mock jwks-rsa at the module level so we don't need to actually parse JWK
    jest.resetModules();
    const mockGetSigningKey = jest.fn().mockResolvedValue({
      getPublicKey: () => publicKey,
    });
    jest.mock('jwks-rsa', () => () => ({ getSigningKey: mockGetSigningKey }));

    const { validateMicrosoftToken: validate } = await import(
      '../../src/middleware/authenticate'
    );

    const idToken = makeIdToken();
    const result = await validate(idToken);

    expect(result.email).toBe(TEST_EMAIL);
    expect(result.name).toBe('Test Runner');
    expect(result.tid).toBe(TEST_TID);
    expect(result.oid).toBe(TEST_OID);
  });

  it('throws TOKEN_EXPIRED for an expired token', async () => {
    jest.resetModules();
    const mockGetSigningKey = jest.fn().mockResolvedValue({
      getPublicKey: () => publicKey,
    });
    jest.mock('jwks-rsa', () => () => ({ getSigningKey: mockGetSigningKey }));

    const { validateMicrosoftToken: validate } = await import(
      '../../src/middleware/authenticate'
    );

    // Sign token with exp in the past (1 hour ago)
    const expiredToken = jwt.sign(
      {
        aud: TEST_CLIENT_ID,
        iss: `https://login.microsoftonline.com/${TEST_TID}/v2.0`,
        tid: TEST_TID,
        oid: TEST_OID,
        email: TEST_EMAIL,
        exp: Math.floor(Date.now() / 1000) - 3600,
      },
      privateKey,
      { algorithm: 'RS256', keyid: TEST_KID },
    );

    await expect(validate(expiredToken)).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
    });
  });

  it('throws for a token with wrong audience', async () => {
    jest.resetModules();
    const mockGetSigningKey = jest.fn().mockResolvedValue({
      getPublicKey: () => publicKey,
    });
    jest.mock('jwks-rsa', () => () => ({ getSigningKey: mockGetSigningKey }));

    const { validateMicrosoftToken: validate } = await import(
      '../../src/middleware/authenticate'
    );

    const wrongAudToken = makeIdToken({ aud: 'wrong-client-id' });
    await expect(validate(wrongAudToken)).rejects.toThrow();
  });

  it('throws for a token with invalid issuer', async () => {
    jest.resetModules();
    const mockGetSigningKey = jest.fn().mockResolvedValue({
      getPublicKey: () => publicKey,
    });
    jest.mock('jwks-rsa', () => () => ({ getSigningKey: mockGetSigningKey }));

    const { validateMicrosoftToken: validate } = await import(
      '../../src/middleware/authenticate'
    );

    const badIssuerToken = makeIdToken({
      iss: 'https://malicious.example.com/v2.0',
    });
    await expect(validate(badIssuerToken)).rejects.toThrow();
  });
});
