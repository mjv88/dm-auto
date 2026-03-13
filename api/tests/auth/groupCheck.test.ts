/**
 * tests/auth/groupCheck.test.ts
 *
 * Tests for checkEntraGroup:
 *   - Uses tenant's group_id from the caller (not from env)
 *   - Correctly returns true/false based on Graph API response
 *   - Caches result for 5 minutes (second call skips Graph)
 */

import nock from 'nock';
import { checkEntraGroup, clearGroupCheckCache } from '../../src/entra/groupCheck';
import { clearGraphTokenCache } from '../../src/entra/graphAuth';

const GRAPH_HOST = 'https://graph.microsoft.com';
const TOKEN_HOST = 'https://login.microsoftonline.com';
const TEST_OID = 'oid-0000-1111-2222-3333';
const TEST_GROUP_ID = 'grp-aaaa-bbbb-cccc-dddd';
const TEST_GRAPH_TOKEN = 'graph-access-token';

function mockGraphToken(): void {
  nock(TOKEN_HOST)
    .post('/common/oauth2/v2.0/token')
    .reply(200, {
      access_token: TEST_GRAPH_TOKEN,
      expires_in: 3600,
    });
}

beforeAll(() => {
  process.env.ENTRA_CLIENT_ID = 'test-client';
  process.env.ENTRA_CLIENT_SECRET = 'test-secret';
  nock.disableNetConnect();
});

afterAll(() => {
  nock.enableNetConnect();
  nock.cleanAll();
});

beforeEach(() => {
  nock.cleanAll();
  clearGroupCheckCache();
  clearGraphTokenCache();
});

describe('checkEntraGroup', () => {
  it('returns true when user is in the group', async () => {
    mockGraphToken();
    nock(GRAPH_HOST)
      .post(`/v1.0/users/${TEST_OID}/checkMemberGroups`, {
        groupIds: [TEST_GROUP_ID],
      })
      .reply(200, { value: [TEST_GROUP_ID] });

    const result = await checkEntraGroup(TEST_OID, TEST_GROUP_ID);
    expect(result).toBe(true);
    expect(nock.isDone()).toBe(true);
  });

  it('returns false when user is NOT in the group', async () => {
    mockGraphToken();
    nock(GRAPH_HOST)
      .post(`/v1.0/users/${TEST_OID}/checkMemberGroups`)
      .reply(200, { value: [] });

    const result = await checkEntraGroup(TEST_OID, TEST_GROUP_ID);
    expect(result).toBe(false);
    expect(nock.isDone()).toBe(true);
  });

  it('uses the group_id passed as argument (not from env)', async () => {
    const customGroupId = 'custom-grp-aaaa-bbbb-cccc';
    mockGraphToken();

    // The nock verifies that the exact groupId from the arg is sent to Graph
    nock(GRAPH_HOST)
      .post(`/v1.0/users/${TEST_OID}/checkMemberGroups`, {
        groupIds: [customGroupId],
      })
      .reply(200, { value: [customGroupId] });

    const result = await checkEntraGroup(TEST_OID, customGroupId);
    expect(result).toBe(true);
    expect(nock.isDone()).toBe(true);
  });

  it('caches the result for 5 minutes (second call skips Graph)', async () => {
    mockGraphToken();
    nock(GRAPH_HOST)
      .post(`/v1.0/users/${TEST_OID}/checkMemberGroups`)
      .reply(200, { value: [TEST_GROUP_ID] });

    // First call — hits Graph
    const first = await checkEntraGroup(TEST_OID, TEST_GROUP_ID);
    expect(first).toBe(true);

    // Second call — should use cache (no additional nock interceptors registered)
    const second = await checkEntraGroup(TEST_OID, TEST_GROUP_ID);
    expect(second).toBe(true);

    // Only one HTTP call should have been made
    expect(nock.isDone()).toBe(true);
  });

  it('uses separate cache entries per OID+groupId combination', async () => {
    const otherOid = 'oid-other-0000-1111';
    const otherGroupId = 'grp-other-aaaa-bbbb';

    // Only one token fetch needed — Graph token is cached after the first call
    mockGraphToken();
    nock(GRAPH_HOST)
      .post(`/v1.0/users/${TEST_OID}/checkMemberGroups`)
      .reply(200, { value: [TEST_GROUP_ID] });
    nock(GRAPH_HOST)
      .post(`/v1.0/users/${otherOid}/checkMemberGroups`)
      .reply(200, { value: [] });

    const r1 = await checkEntraGroup(TEST_OID, TEST_GROUP_ID);
    const r2 = await checkEntraGroup(otherOid, otherGroupId);

    expect(r1).toBe(true);
    expect(r2).toBe(false);
    expect(nock.isDone()).toBe(true);
  });
});
