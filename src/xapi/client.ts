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
}

export interface XAPIGroup {
  id:   number;
  name: string;
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
      `&$expand=Groups` +
      `&$select=Id,Number,FirstName,LastName,EmailAddress`;

    const data = (await this.get(path)) as {
      value: Array<{
        Id:           number;
        EmailAddress: string;
        Groups:       Array<{ GroupId: number }>;
      }>;
    };

    const user = data.value[0];
    if (!user) {
      throw new PBXUnavailableError(
        `No user found with extension '${extensionNumber}' on ${this.pbxFqdn}`,
      );
    }

    return {
      userId:         user.Id,
      currentGroupId: user.Groups[0]?.GroupId ?? 0,
      emailAddress:   user.EmailAddress,
    };
  }

  /**
   * Returns all groups (departments) ordered by name.
   *
   * GET /xapi/v1/Groups?$select=Id,Name&$orderby=Name
   */
  async getGroups(): Promise<XAPIGroup[]> {
    const data = (await this.get('/Groups?$select=Id,Name&$orderby=Name')) as {
      value: Array<{ Id: number; Name: string }>;
    };

    return data.value.map((g) => ({ id: g.Id, name: g.Name }));
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
  async patchUserGroup(userId: number, targetGroupId: number): Promise<void> {
    await this.patch(`/Users(${userId})`, {
      Groups: [{ GroupId: targetGroupId, Rights: { RoleName: 'users' } }],
      Id:     userId,
    });
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
