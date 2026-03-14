/**
 * tests/xapi/getAllUsers.test.ts
 *
 * Tests for XAPIClient.getAllUsers() — paginated extension discovery.
 * All HTTP calls are intercepted by nock.
 */

import nock from 'nock';
import { XAPIClient } from '../../src/xapi/client';
import type { XAPIUserExtension } from '../../src/xapi/client';

// ── Constants ─────────────────────────────────────────────────────────────────

const TEST_FQDN = 'pbx.example.com';
const TEST_TOKEN = 'test-bearer-token';
const ALLOWED_FQDNS: string[] = [TEST_FQDN];

// ── Helpers ───────────────────────────────────────────────────────────────────

const instantDelay = jest.fn().mockResolvedValue(undefined);
const mockTokenProvider = jest.fn().mockResolvedValue(TEST_TOKEN);

function makeClient(): XAPIClient {
  return new XAPIClient(TEST_FQDN, ALLOWED_FQDNS, mockTokenProvider, instantDelay);
}

/** Builds a mock xAPI Users response page. */
function buildUsersPage(
  users: Array<{ id: number; number: string; first: string; last: string; email: string; groupId: number }>,
) {
  return {
    value: users.map((u) => ({
      Id: u.id,
      Number: u.number,
      FirstName: u.first,
      LastName: u.last,
      EmailAddress: u.email,
      Groups: [{ GroupId: u.groupId }],
    })),
  };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(() => {
  process.env.ENCRYPTION_KEY = '0'.repeat(64);
  nock.disableNetConnect();
});

beforeEach(() => {
  nock.cleanAll();
  jest.clearAllMocks();
  mockTokenProvider.mockResolvedValue(TEST_TOKEN);
});

afterAll(() => {
  nock.enableNetConnect();
  nock.cleanAll();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getAllUsers', () => {
  it('returns all users from a single page (fewer than PAGE_SIZE)', async () => {
    nock(`https://${TEST_FQDN}`)
      .get(/\/xapi\/v1\/Users/)
      .reply(200, buildUsersPage([
        { id: 1, number: '100', first: 'Alice', last: 'Smith', email: 'alice@example.com', groupId: 10 },
        { id: 2, number: '101', first: 'Bob', last: 'Jones', email: 'bob@example.com', groupId: 20 },
      ]));

    const client = makeClient();
    const result = await client.getAllUsers();

    expect(result).toEqual<XAPIUserExtension[]>([
      { userId: 1, number: '100', email: 'alice@example.com', displayName: 'Alice Smith', currentGroupId: 10 },
      { userId: 2, number: '101', email: 'bob@example.com', displayName: 'Bob Jones', currentGroupId: 20 },
    ]);
    expect(nock.isDone()).toBe(true);
  });

  it('handles empty PBX (no users)', async () => {
    nock(`https://${TEST_FQDN}`)
      .get(/\/xapi\/v1\/Users/)
      .reply(200, { value: [] });

    const client = makeClient();
    const result = await client.getAllUsers();

    expect(result).toEqual([]);
    expect(nock.isDone()).toBe(true);
  });

  it('handles user with no groups (currentGroupId defaults to 0)', async () => {
    nock(`https://${TEST_FQDN}`)
      .get(/\/xapi\/v1\/Users/)
      .reply(200, {
        value: [{
          Id: 5,
          Number: '200',
          FirstName: 'Charlie',
          LastName: 'Brown',
          EmailAddress: 'charlie@example.com',
          Groups: [],
        }],
      });

    const client = makeClient();
    const result = await client.getAllUsers();

    expect(result[0]!.currentGroupId).toBe(0);
  });

  it('handles user with null EmailAddress (defaults to empty string)', async () => {
    nock(`https://${TEST_FQDN}`)
      .get(/\/xapi\/v1\/Users/)
      .reply(200, {
        value: [{
          Id: 6,
          Number: '201',
          FirstName: 'Dana',
          LastName: '',
          EmailAddress: null,
          Groups: [{ GroupId: 15 }],
        }],
      });

    const client = makeClient();
    const result = await client.getAllUsers();

    expect(result[0]!.email).toBe('');
    expect(result[0]!.displayName).toBe('Dana');
  });

  it('paginates correctly when first page returns exactly PAGE_SIZE=1000 users', async () => {
    // We can't easily build 1000 mock users, so we'll verify the pagination
    // logic by checking that a second request is made when the first page
    // returns exactly 1000 items.
    const page1Users = Array.from({ length: 1000 }, (_, i) => ({
      Id: i + 1,
      Number: String(100 + i),
      FirstName: `User`,
      LastName: `${i}`,
      EmailAddress: `user${i}@example.com`,
      Groups: [{ GroupId: 1 }],
    }));

    const page2Users = [
      {
        Id: 1001,
        Number: '1100',
        FirstName: 'Last',
        LastName: 'User',
        EmailAddress: 'last@example.com',
        Groups: [{ GroupId: 2 }],
      },
    ];

    nock(`https://${TEST_FQDN}`)
      .get(/\/xapi\/v1\/Users.*\$skip=0/)
      .reply(200, { value: page1Users })
      .get(/\/xapi\/v1\/Users.*\$skip=1000/)
      .reply(200, { value: page2Users });

    const client = makeClient();
    const result = await client.getAllUsers();

    expect(result).toHaveLength(1001);
    expect(result[1000]).toEqual({
      userId: 1001,
      number: '1100',
      email: 'last@example.com',
      displayName: 'Last User',
      currentGroupId: 2,
    });
    expect(nock.isDone()).toBe(true);
  });
});
