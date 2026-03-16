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

export interface XAPIUserExtension {
  userId:          number;
  number:          string;
  email:           string;
  currentGroupName: string;
  displayName:    string;
  currentGroupId: number;
}

// ── Retry configuration ───────────────────────────────────────────────────────

const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;

// ── XAPIClient ────────────────────────────────────────────────────────────────

export class XAPIClient {
  private readonly baseUrl: string;

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
   * Looks up a 3CX user (extension) by number.
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
   */
  async getGroups(): Promise<XAPIGroup[]> {
    const data = (await this.get('/Groups?$select=Id,Name&$orderby=Name')) as {
      value: Array<{ Id: number; Name: string }>;
    };

    return data.value.map((g) => ({ id: g.Id, name: g.Name }));
  }

  /**
   * Returns all users (extensions) from the PBX, paginated via $top/$skip.
   * Includes Id for pbxUserId (needed for GenerateProvLink).
   */
  async getAllUsers(): Promise<XAPIUserExtension[]> {
    const PAGE_SIZE = 50;
    const allUsers: XAPIUserExtension[] = [];
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const path =
        `/Users?$top=${PAGE_SIZE}&$skip=${skip}` +
        `&$select=Id,Number,DisplayName,EmailAddress` +
        `&$expand=Groups($select=GroupId,Name)`;

      const data = (await this.get(path)) as {
        value: Array<{
          Id: number;
          Number: string;
          DisplayName: string;
          EmailAddress: string;
          PrimaryGroupId: number;
          Groups: Array<{ GroupId: number; Name: string }>;
        }>;
      };

      for (const u of data.value) {
        const primaryGroup = u.Groups?.find(g => g.GroupId === u.PrimaryGroupId);
        allUsers.push({
          userId: u.Id,
          number: u.Number ?? '',
          email: u.EmailAddress ?? '',
          displayName: u.DisplayName ?? '',
          currentGroupId: u.PrimaryGroupId ?? 0,
          currentGroupName: primaryGroup?.Name ?? '',
        });
      }
      hasMore = data.value.length === PAGE_SIZE;
      skip += PAGE_SIZE;
    }
    return allUsers;
  }

  /**
   * Generates a provisioning link for a user (extension).
   * Calls POST /xapi/v1/Users({userId})/Pbx.GenerateProvLink()
   */
  async generateProvLink(userId: number): Promise<string> {
    const path = `/Users(${userId})/Pbx.GenerateProvLink()`;
    const data = (await this.get(path)) as { value: string };
    return data.value;
  }

  /**
   * Moves a user into the target group (department).
   */
  async patchUserGroup(userId: number, targetGroupId: number): Promise<void> {
    await this.patch(`/Users(${userId})`, {
      Groups: [{ GroupId: targetGroupId, Rights: { RoleName: 'users' } }],
      Id:     userId,
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  async get(path: string): Promise<unknown> {
    return this.request('GET', path);
  }

  private async patch(path: string, body: unknown): Promise<void> {
    await this.request('PATCH', path, body);
  }

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

        if (res.status === 204) return undefined;

        if (res.status === 405 && method === 'PATCH') {
          return this.request('PUT', path, body);
        }

        if (res.ok) return await res.json();

        lastError = new PBXUnavailableError(
          `PBX ${this.pbxFqdn} returned HTTP ${res.status}`,
        );
        retryable = res.status >= 500;
      } catch (err) {
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
        throw lastError;
      }
    }

    throw lastError;
  }
}
