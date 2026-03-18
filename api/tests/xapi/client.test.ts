/**
 * tests/xapi/client.test.ts
 *
 * All HTTP calls are intercepted by nock so no real network traffic is made.
 * Time-based delays are replaced with an instant no-op so tests run fast.
 */

import nock from 'nock';
import { XAPIClient, PBXUnavailableError } from '../../src/xapi/client';
import { getXAPIToken } from '../../src/xapi/auth';
import { encrypt } from '../../src/utils/encrypt';
import type { getDb } from '../../src/db/index';

// ── Constants ─────────────────────────────────────────────────────────────────

const TEST_FQDN    = 'pbx.example.com';
const TEST_TOKEN   = 'test-bearer-token';
const ALLOWED_FQDNS: string[] = [TEST_FQDN];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Instant delay (no-op) so retry tests don't slow down the suite. */
const instantDelay = jest.fn().mockResolvedValue(undefined);

/** Token provider that returns TEST_TOKEN without hitting the DB. */
const mockTokenProvider = jest.fn().mockResolvedValue(TEST_TOKEN);

/** Creates an XAPIClient wired up for testing (no DB, instant delays). */
function makeClient(fqdn = TEST_FQDN, allowed = ALLOWED_FQDNS): XAPIClient {
  return new XAPIClient(fqdn, allowed, mockTokenProvider, instantDelay);
}

/**
 * Builds a minimal drizzle-compatible mock DB.
 * The chained API (.select().from().where().limit()) resolves to `rows`.
 * .update().set().where() resolves to [].
 */
function makeMockDb(rows: unknown[]): ReturnType<typeof getDb> {
  return {
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
  } as unknown as ReturnType<typeof getDb>;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(() => {
  // 64-char hex key required by AES-256-GCM (encrypt/decrypt in auth tests)
  process.env.ENCRYPTION_KEY = '0'.repeat(64);
  // Prevent any un-mocked requests from hitting the network
  nock.disableNetConnect();
});

beforeEach(() => {
  nock.cleanAll();
  jest.clearAllMocks();
  mockTokenProvider.mockResolvedValue(TEST_TOKEN);
  instantDelay.mockResolvedValue(undefined);
});

afterAll(() => {
  nock.enableNetConnect();
  nock.cleanAll();
});

// ── 1. Successful user lookup by extension number ─────────────────────────────

describe('getUserByNumber', () => {
  it('returns { userId, currentGroupId, emailAddress, roleName } on success', async () => {
    nock(`https://${TEST_FQDN}`)
      .get(/\/xapi\/v1\/Users/)
      .reply(200, {
        value: [
          {
            Id:             42,
            Number:         '101',
            EmailAddress:   'maria@customer.de',
            PrimaryGroupId: 28,
            Groups:         [{ GroupId: 28, Rights: { RoleName: 'supervisors' } }],
          },
        ],
      });

    const client = makeClient();
    const result = await client.getUserByNumber('101');

    expect(result).toEqual({
      userId:         42,
      currentGroupId: 28,
      emailAddress:   'maria@customer.de',
      roleName:       'supervisors',
    });
    expect(nock.isDone()).toBe(true);
  });

  it('falls back to "users" role when Rights are absent', async () => {
    nock(`https://${TEST_FQDN}`)
      .get(/\/xapi\/v1\/Users/)
      .reply(200, {
        value: [
          {
            Id:             7,
            EmailAddress:   'tom@example.com',
            PrimaryGroupId: 5,
            Groups:         [{ GroupId: 5 }],
          },
        ],
      });

    const client = makeClient();
    const result = await client.getUserByNumber('102');
    expect(result.roleName).toBe('users');
    expect(nock.isDone()).toBe(true);
  });
});

// ── 2. Successful group list ──────────────────────────────────────────────────

describe('getGroups', () => {
  it('returns an array of { id, name } ordered by name', async () => {
    nock(`https://${TEST_FQDN}`)
      .get('/xapi/v1/Groups?$select=Id,Name&$orderby=Name')
      .reply(200, {
        value: [
          { Id: 28, Name: 'DEFAULT' },
          { Id: 35, Name: 'Sales'   },
          { Id: 41, Name: 'Support' },
        ],
      });

    const client = makeClient();
    const groups = await client.getGroups();

    expect(groups).toEqual([
      { id: 28, name: 'DEFAULT' },
      { id: 35, name: 'Sales'   },
      { id: 41, name: 'Support' },
    ]);
    expect(nock.isDone()).toBe(true);
  });
});

// ── 3. Successful PATCH → 204 → no error thrown ───────────────────────────────

describe('patchUserGroup', () => {
  it('resolves without error when the PBX responds with 204 (defaults to "users" role)', async () => {
    nock(`https://${TEST_FQDN}`)
      .patch('/xapi/v1/Users(42)', {
        Groups: [{ GroupId: 35, Rights: { RoleName: 'users' } }],
        Id: 42,
      })
      .reply(204);

    const client = makeClient();
    await expect(client.patchUserGroup(42, 35)).resolves.toBeUndefined();
    expect(nock.isDone()).toBe(true);
  });

  it('preserves the provided roleName in the PATCH body', async () => {
    nock(`https://${TEST_FQDN}`)
      .patch('/xapi/v1/Users(42)', {
        Groups: [{ GroupId: 35, Rights: { RoleName: 'system_admins' } }],
        Id: 42,
      })
      .reply(204);

    const client = makeClient();
    await expect(client.patchUserGroup(42, 35, null, 'system_admins')).resolves.toBeUndefined();
    expect(nock.isDone()).toBe(true);
  });

  it('includes OutboundCallerID in the body when provided', async () => {
    nock(`https://${TEST_FQDN}`)
      .patch('/xapi/v1/Users(42)', {
        Groups: [{ GroupId: 35, Rights: { RoleName: 'users' } }],
        Id: 42,
        OutboundCallerID: '+49111222333',
      })
      .reply(204);

    const client = makeClient();
    await expect(client.patchUserGroup(42, 35, '+49111222333')).resolves.toBeUndefined();
    expect(nock.isDone()).toBe(true);
  });

  it('omits OutboundCallerID from the body when null is passed', async () => {
    nock(`https://${TEST_FQDN}`)
      .patch('/xapi/v1/Users(42)', {
        Groups: [{ GroupId: 35, Rights: { RoleName: 'users' } }],
        Id: 42,
      })
      .reply(204);

    const client = makeClient();
    await expect(client.patchUserGroup(42, 35, null)).resolves.toBeUndefined();
    expect(nock.isDone()).toBe(true);
  });
});

// ── 4. Token refresh when expired ────────────────────────────────────────────

describe('getXAPIToken — token refresh', () => {
  it('fetches and caches a new token when the stored token has expired', async () => {
    const expiredAt       = new Date(Date.now() - 60_000); // 1 min in the past
    const encryptedOld    = encrypt('old-access-token');
    const encryptedId     = encrypt('xapi-client-id');
    const encryptedSecret = encrypt('xapi-client-secret');

    const mockDb = makeMockDb([
      {
        xapiToken:          encryptedOld,
        xapiTokenExpiresAt: expiredAt,
        xapiClientId:       encryptedId,
        xapiSecret:         encryptedSecret,
      },
    ]);

    nock(`https://${TEST_FQDN}`)
      .post('/connect/token')
      .reply(200, { access_token: 'brand-new-token', expires_in: 3600 });

    const token = await getXAPIToken(TEST_FQDN, mockDb);

    expect(token).toBe('brand-new-token');
    expect(nock.isDone()).toBe(true);
  });

  it('returns the cached token without hitting /connect/token when still valid', async () => {
    const futureExpiry = new Date(Date.now() + 3_600_000); // 1 hr from now
    const encryptedGood = encrypt('still-valid-token');

    const mockDb = makeMockDb([
      {
        xapiToken:          encryptedGood,
        xapiTokenExpiresAt: futureExpiry,
        xapiClientId:       null,
        xapiSecret:         null,
      },
    ]);

    // No nock intercept — any network call would cause the test to fail
    const token = await getXAPIToken(TEST_FQDN, mockDb);
    expect(token).toBe('still-valid-token');
  });
});

// ── 5. Retry on 503 — exponential back-off 1 s / 2 s / 4 s ──────────────────

describe('retry logic', () => {
  it('retries on HTTP 503 and succeeds on the 3rd attempt', async () => {
    nock(`https://${TEST_FQDN}`)
      .get(/\/xapi\/v1\/Users/)
      .reply(503)   // attempt 1 — fail
      .get(/\/xapi\/v1\/Users/)
      .reply(503)   // attempt 2 — fail
      .get(/\/xapi\/v1\/Users/)
      .reply(200, { // attempt 3 — succeed
        value: [{ Id: 7, Number: '102', EmailAddress: 'tom@example.com', Groups: [{ GroupId: 5 }] }],
      });

    const client = makeClient();
    const result = await client.getUserByNumber('102');

    expect(result.userId).toBe(7);
    expect(nock.isDone()).toBe(true);

    // Delay was called twice (before attempt 2 and before attempt 3)
    expect(instantDelay).toHaveBeenCalledTimes(2);
    expect(instantDelay).toHaveBeenNthCalledWith(1, 1000);
    expect(instantDelay).toHaveBeenNthCalledWith(2, 2000);
  });

// ── 6. Throw PBX_UNAVAILABLE after 3 failures ────────────────────────────────

  it('throws PBXUnavailableError after 3 consecutive 503 responses', async () => {
    nock(`https://${TEST_FQDN}`)
      .get(/\/xapi\/v1\/Users/)
      .reply(503)
      .get(/\/xapi\/v1\/Users/)
      .reply(503)
      .get(/\/xapi\/v1\/Users/)
      .reply(503);

    const client = makeClient();
    await expect(client.getUserByNumber('101')).rejects.toBeInstanceOf(PBXUnavailableError);
    await expect(client.getUserByNumber('101')).rejects.toMatchObject({ code: 'PBX_UNAVAILABLE' });

    expect(nock.isDone()).toBe(true);

    // Back-off delays: 1 s before attempt 2, 2 s before attempt 3
    expect(instantDelay).toHaveBeenCalledWith(1000);
    expect(instantDelay).toHaveBeenCalledWith(2000);
  });
});

// ── 7. Non-whitelisted FQDN rejected before any HTTP call ────────────────────

describe('FQDN whitelist', () => {
  it('throws PBXUnavailableError synchronously for an unregistered FQDN', () => {
    // No nock interceptors — any HTTP attempt would throw an error
    expect(
      () => new XAPIClient('attacker.evil.com', ALLOWED_FQDNS, mockTokenProvider, instantDelay),
    ).toThrow(PBXUnavailableError);

    expect(
      () => new XAPIClient('attacker.evil.com', ALLOWED_FQDNS, mockTokenProvider, instantDelay),
    ).toThrow("FQDN 'attacker.evil.com' is not registered in the PBX whitelist");
  });

  it('accepts an FQDN that is present in the whitelist', () => {
    expect(
      () => new XAPIClient(TEST_FQDN, ALLOWED_FQDNS, mockTokenProvider, instantDelay),
    ).not.toThrow();
  });
});
