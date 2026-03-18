import { eq } from 'drizzle-orm';
import { getXAPIToken } from './auth.js';

// ── Error type ────────────────────────────────────────────────────────────────

export class PBXUnavailableError extends Error {
  readonly code = 'PBX_UNAVAILABLE';

  constructor(message: string) {
    super(message);
    this.name = 'PBXUnavailableError';
  }
}

// ── Response shapes ───────────────────────────────────────────────────────────

export interface XAPIUserResult {
  userId:         number;
  currentGroupId: number;
  emailAddress:   string;
  roleName:       string;   // RoleName from the user's primary group Rights
}

export interface XAPIGroup {
  id:   number;
  name: string;
}

export interface XAPIUserExtension {
  userId:           number;
  number:           string;
  email:            string;
  currentGroupName: string;
  displayName:      string;
  currentGroupId:   number;
  outboundCallerId: string | null;
}

export interface XAPIRingGroupMember {
  id?:    number;       // present on existing members; omit when adding new
  number: string;       // extension number — used to identify the runner
  name?:  string | null;
  tags?:  unknown[];
}

export interface XAPIRingGroup {
  id:       number;
  name:     string;
  number:   string;
  groupIds: number[];   // department IDs this ring group belongs to
  members:  XAPIRingGroupMember[];
}

// ── Retry configuration ───────────────────────────────────────────────────────

/** Milliseconds to wait before each successive attempt (index = attempt - 1). */
const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

/** Maximum total attempts (1 initial + up to 2 retries). */
const MAX_ATTEMPTS = 3;

/** Per-request timeout in milliseconds. */
const REQUEST_TIMEOUT_MS = 10_000;

// ── XAPIClient ────────────────────────────────────────────────────────────────

/**
 * Thin HTTP client for the 3CX xAPI v1.
 *
 * IMPORTANT — 3CX naming convention:
 *   Admin UI: "Extensions" / "Departments"
 *   xAPI:     "Users"      / "Groups"
 *   All endpoint paths use the xAPI names.
 *
 * Usage in production:
 *   const client = await XAPIClient.create(pbxFqdn);
 *
 * Usage in tests (inject mocks, no DB required):
 *   const client = new XAPIClient(fqdn, [fqdn], mockTokenProvider, instantDelay);
 */
export class XAPIClient {
  private readonly baseUrl: string;

  /**
   * @param pbxFqdn       Fully-qualified domain name of the PBX.
   * @param allowedFqdns  Whitelist of registered FQDNs.  Throws
   *                      PBXUnavailableError immediately if pbxFqdn is absent,
   *                      preventing any HTTP call to an unregistered host.
   * @param tokenProvider Returns a Bearer token for the given FQDN.
   *                      Defaults to the real getXAPIToken (DB-backed).
   * @param delay         Sleep helper used between retries.
   *                      Pass `async () => {}` in tests for instant retries.
   */
  constructor(
    private readonly pbxFqdn: string,
    allowedFqdns: readonly string[],
    private readonly tokenProvider: (fqdn: string) => Promise<string> = getXAPIToken,
    private readonly delay: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    if (!allowedFqdns.includes(pbxFqdn)) {
      throw new PBXUnavailableError(
        `FQDN '${pbxFqdn}' is not registered in the PBX whitelist`,
      );
    }
    this.baseUrl = `https://${pbxFqdn}/xapi/v1`;
  }

  /**
   * Factory for production use: validates pbxFqdn against the active rows in
   * the pbx_credentials table before constructing the client.
   */
  static async create(pbxFqdn: string): Promise<XAPIClient> {
    const { getDb, schema } = await import('../db/index.js');

    const db = getDb();

    const rows = await db
      .select({ pbxFqdn: schema.pbxCredentials.pbxFqdn })
      .from(schema.pbxCredentials)
      .where(eq(schema.pbxCredentials.isActive, true));

    const allowed = rows.map((r) => r.pbxFqdn);
    return new XAPIClient(pbxFqdn, allowed);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Looks up a 3CX user (extension) by number and returns the fields required
   * for the department-switch flow.
   *
   * GET /xapi/v1/Users?$filter=Number eq '{n}'&$expand=Groups
   *                  &$select=Id,Number,FirstName,LastName,EmailAddress
   */
  async getUserByNumber(extensionNumber: string): Promise<XAPIUserResult> {
    const path =
      `/Users?$filter=Number eq '${extensionNumber}'` +
      `&$expand=Groups($expand=Rights)` +
      `&$select=Id,Number,EmailAddress,PrimaryGroupId`;

    const data = (await this.get(path)) as {
      value: Array<{
        Id:             number;
        EmailAddress:   string;
        PrimaryGroupId: number;
        Groups:         Array<{ GroupId: number; Rights?: { RoleName?: string } }>;
      }>;
    };

    const user = data.value[0];
    if (!user) {
      throw new PBXUnavailableError(
        `No user found with extension '${extensionNumber}' on ${this.pbxFqdn}`,
      );
    }

    // Preserve the user's role from their primary group — fall back to 'users'
    const primaryGroup = user.Groups?.find(g => g.GroupId === user.PrimaryGroupId)
      ?? user.Groups?.[0];
    const roleName = primaryGroup?.Rights?.RoleName ?? 'users';

    return {
      userId:         user.Id,
      currentGroupId: user.PrimaryGroupId ?? user.Groups?.[0]?.GroupId ?? 0,
      emailAddress:   user.EmailAddress,
      roleName,
    };
  }

  /**
   * Returns all groups (departments) ordered by name.
   *
   * GET /xapi/v1/Groups?$select=Id,Name&$orderby=Name
   */
  async getGroups(): Promise<XAPIGroup[]> {
    const data = (await this.get(
      `/Groups?$filter=not startsWith(Name,'___FAVORITES___')&$orderby=Name&$select=Name,Id`,
    )) as {
      value: Array<{ Id: number; Name: string }>;
    };

    return data.value.map((g) => ({ id: g.Id, name: g.Name }));
  }

  /**
   * Returns all users (extensions) from the PBX, paginated via $top/$skip.
   * Used during onboarding to let admins select which extensions become runners.
   *
   * GET /xapi/v1/Users?$select=Id,Number,FirstName,LastName,EmailAddress
   *                   &$expand=Groups&$top=1000&$skip=…
   */
  async getAllUsers(): Promise<XAPIUserExtension[]> {
    const PAGE_SIZE = 50;
    const allUsers: XAPIUserExtension[] = [];
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const path =
        `/Users?$top=${PAGE_SIZE}&$skip=${skip}` +
        `&$select=DisplayName,EmailAddress,PrimaryGroupId,OutboundCallerID` +
        `&$expand=Groups($select=GroupId,Name)`;

      const data = (await this.get(path)) as {
        value: Array<{
          Id: number;
          Number: string;
          DisplayName: string;
          EmailAddress: string;
          PrimaryGroupId: number;
          OutboundCallerID: string | null;
          Groups: Array<{ GroupId: number; Name: string }>;
        }>;
      };

      for (const u of data.value) {
        // Find the primary group name from the Groups array
        const primaryGroup = u.Groups?.find(g => g.GroupId === u.PrimaryGroupId);
        allUsers.push({
          userId: u.Id,
          number: u.Number ?? '',
          email: u.EmailAddress ?? '',
          displayName: u.DisplayName ?? '',
          currentGroupId: u.PrimaryGroupId ?? 0,
          currentGroupName: primaryGroup?.Name ?? '',
          outboundCallerId: u.OutboundCallerID ?? null,
        });
      }
      hasMore = data.value.length === PAGE_SIZE;
      skip += PAGE_SIZE;
    }
    return allUsers;
  }

  /**
   * Moves a user into the target group (department).
   *
   * Sends the complete target Groups array so the PBX replaces membership
   * regardless of whether it treats PATCH as full-replace or partial-merge.
   *
   * PATCH /xapi/v1/Users({userId})
   * Expected: 204 No Content
   *
   * 3CX v18 compatibility: falls back to PUT if PATCH returns 405.
   *
   * @throws PBXUnavailableError on any non-204 response or network failure.
   */
  async patchUserGroup(
    userId: number,
    targetGroupId: number,
    outboundCallerId?: string | null,
    roleName = 'users',
  ): Promise<void> {
    await this.patch(`/Users(${userId})`, {
      Groups: [{ GroupId: targetGroupId, Rights: { RoleName: roleName } }],
      Id:     userId,
      ...(outboundCallerId ? { OutboundCallerID: outboundCallerId } : {}),
    });
  }

  /**
   * Fetches all ring groups with their department associations and current
   * member lists. Used by the switch route to compute ring group deltas.
   *
   * GET /xapi/v1/RingGroups
   *   ?$select=Id,Name,Number
   *   &$expand=Members,Groups($select=GroupId,Name;$filter=not startsWith(Name,'___FAVORITES___'))
   *
   * Client-side fallback: any Group entry whose Name starts with ___FAVORITES___
   * is filtered out in case the PBX ignores the nested $filter.
   */
  async getRingGroups(): Promise<XAPIRingGroup[]> {
    const path =
      `/RingGroups?$select=Id,Name,Number` +
      `&$expand=Members,Groups($select=GroupId,Name;$filter=not startsWith(Name,'___FAVORITES___'))`;

    const data = (await this.get(path)) as {
      value: Array<{
        Id:      number;
        Name:    string;
        Number:  string;
        Groups:  Array<{ GroupId: number; Name: string }> | null;
        Members: Array<{ Id?: number; Number: string; Name?: string | null; Tags?: unknown[] }> | null;
      }>;
    };

    return data.value.map(rg => ({
      id:      rg.Id,
      name:    rg.Name,
      number:  rg.Number,
      groupIds: (rg.Groups ?? [])
        .filter(g => !g.Name.startsWith('___FAVORITES___'))
        .map(g => g.GroupId),
      members: (rg.Members ?? []).map(m => ({
        id:     m.Id,
        number: m.Number,
        name:   m.Name ?? null,
        tags:   m.Tags ?? [],
      })),
    }));
  }

  /**
   * Replaces the member list of a ring group.
   * Must include ALL members (not just the changed one) — the PBX replaces
   * the entire Members array on PATCH.
   *
   * PATCH /xapi/v1/RingGroups({ringGroupId})
   * Body: { Members: [...] }  — PascalCase keys required by 3CX xAPI
   * Expected: 204 No Content
   *
   * Only the runner is added/removed — all other members are preserved by caller.
   */
  async updateRingGroupMembers(
    ringGroupId: number,
    members: XAPIRingGroupMember[],
  ): Promise<void> {
    // The 3CX xAPI requires PascalCase keys in the PATCH body.
    // XAPIRingGroupMember uses camelCase internally — serialize here.
    const pbxMembers = members.map(m => ({
      ...(m.id     !== undefined ? { Id:   m.id }   : {}),
      Number: m.number,
      ...(m.name   !== undefined ? { Name: m.name } : {}),
      ...(m.tags   !== undefined ? { Tags: m.tags } : {}),
    }));
    await this.patch(`/RingGroups(${ringGroupId})`, { Members: pbxMembers });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async get(path: string): Promise<unknown> {
    return this.request('GET', path);
  }

  private async patch(path: string, body: unknown): Promise<void> {
    await this.request('PATCH', path, body);
  }

  /**
   * Executes an HTTP request against the xAPI with Bearer auth.
   *
   * Retry policy:
   *   - Retries on HTTP 5xx, network errors, and request timeouts.
   *   - Up to MAX_ATTEMPTS (3) total attempts.
   *   - Exponential back-off: 1 s → 2 s (→ 4 s if there were a 4th attempt).
   *   - Throws PBXUnavailableError after all attempts are exhausted.
   *   - Does NOT retry on 4xx (client errors).
   *
   * Timeout: each individual attempt is aborted after REQUEST_TIMEOUT_MS (10 s).
   *
   * 3CX v18 compatibility: if PATCH returns 405 Method Not Allowed, the
   * request is immediately retried once using PUT before falling through to
   * the normal error path.
   */
  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    let lastError: PBXUnavailableError = new PBXUnavailableError(
      `PBX ${this.pbxFqdn} is unreachable`,
    );

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await this.delay(RETRY_DELAYS_MS[attempt - 1]);
      }

      let retryable = false;

      try {
        const token   = await this.tokenProvider(this.pbxFqdn);
        const url     = `${this.baseUrl}${path}`;
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          Accept:        'application/json',
        };
        if (body !== undefined) {
          headers['Content-Type'] = 'application/json';
        }

        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        let res: Response;
        try {
          res = await fetch(url, {
            method,
            headers,
            body:   body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        // 204 No Content — PATCH / PUT success
        if (res.status === 204) return undefined;

        // 405 Method Not Allowed on PATCH → 3CX v18: retry immediately with PUT
        if (res.status === 405 && method === 'PATCH') {
          return this.request('PUT', path, body);
        }

        // 2xx — parse and return body
        if (res.ok) return await res.json();

        lastError = new PBXUnavailableError(
          `PBX ${this.pbxFqdn} returned HTTP ${res.status}`,
        );
        retryable = res.status >= 500;
      } catch (err) {
        // Timeout (AbortError) or network / DNS / TLS errors — treat as retryable
        const isTimeout =
          err instanceof Error &&
          (err.name === 'AbortError' || err.name === 'TimeoutError');

        lastError = err instanceof PBXUnavailableError
          ? err
          : new PBXUnavailableError(
              isTimeout
                ? `Request to ${this.pbxFqdn} timed out after ${REQUEST_TIMEOUT_MS}ms`
                : `Network error reaching ${this.pbxFqdn}: ${(err as Error).message}`,
            );
        retryable = true;
      }

      if (!retryable) {
        // 4xx (non-405-PATCH) — fail immediately without further retries
        throw lastError;
      }
    }

    throw lastError;
  }
}
