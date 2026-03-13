Read RUNNER_APP_SPEC.md section §9 (xAPI Integration) completely.

Your task: Build the complete 3CX xAPI client.

IMPORTANT — 3CX xAPI naming:
  The 3CX admin UI says "Extensions" and "Departments".
  The xAPI calls them "Users" and "Groups" respectively.
  Use the xAPI names (Users / Groups) in all endpoint paths.

Required deliverables:
- src/xapi/client.ts
  Class: XAPIClient
  Constructor: takes pbxFqdn, validates against whitelist
  Methods:
    getUserByNumber(extensionNumber: string)
      → GET /xapi/v1/Users?$filter=Number eq '{n}'&$expand=Groups&$select=Id,Number,FirstName,LastName,EmailAddress
      → Returns { userId, currentGroupId, emailAddress }

    getGroups()
      → GET /xapi/v1/Groups?$select=Id,Name&$orderby=Name
      → Returns array of { id, name }

    patchUserGroup(userId: number, targetGroupId: number)
      → PATCH /xapi/v1/Users({userId})
      → Body: { "Groups": [{ "GroupId": targetGroupId, "Rights": { "RoleName": "users" } }], "Id": userId }
      → Returns 204; throws PBX_UNAVAILABLE on failure

- src/xapi/auth.ts
  Function: getXAPIToken(pbxFqdn: string)
  - Checks pbx_credentials table for cached token
  - If expired or missing: POST to /connect/token
  - Caches new token with 5-minute buffer
  - Encrypts stored token (use AES-256-GCM with ENCRYPTION_KEY env var)

- src/utils/encrypt.ts
  encrypt(text: string): string
  decrypt(text: string): string

- tests/xapi/client.test.ts
  - Mock all HTTP calls with nock
  - Test: successful user lookup by extension number
  - Test: successful group list
  - Test: successful PATCH → 204 → no error thrown
  - Test: token refresh when expired
  - Test: retry on 503 (3 attempts, exponential backoff 1s/2s/4s)
  - Test: throw PBX_UNAVAILABLE after 3 failures
  - Test: non-whitelisted FQDN rejected before any HTTP call

Commit to branch feature/xapi-client.
Open PR: "feat: 3CX xAPI client with OAuth and retry logic"
Update BUILD_STATE.json: xapi_client.status = "complete"
