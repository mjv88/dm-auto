/**
 * src/entra/groupCheck.ts
 *
 * Checks whether a user (identified by their Entra OID) is a member of a
 * specific security group, using the Microsoft Graph API.
 *
 * The group ID comes from the tenants table (per-customer), NOT from env vars.
 *
 * Results are cached in-memory for 5 minutes (key = oid:groupId) to avoid
 * hammering Graph on every request while still picking up membership changes
 * within a reasonable window.
 */

import { getGraphToken } from './graphAuth.js';

interface CacheEntry {
  result: boolean;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Returns true if the user with the given OID is a member of tenantGroupId.
 *
 * Uses POST /v1.0/users/{oid}/checkMemberGroups which is more efficient than
 * GET /memberOf for a single group check and works transitively.
 *
 * @param oid           The user's Entra object ID (from the ID token's `oid` claim).
 * @param tenantGroupId The group ID stored in the tenants table (entra_group_id).
 */
export async function checkEntraGroup(
  oid: string,
  tenantGroupId: string,
): Promise<boolean> {
  const key = `${oid}:${tenantGroupId}`;
  const now = Date.now();

  const cached = _cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  const token = await getGraphToken();

  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/users/${oid}/checkMemberGroups`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ groupIds: [tenantGroupId] }),
    },
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(
      `Graph checkMemberGroups failed for OID ${oid}: HTTP ${resp.status} — ${text}`,
    );
  }

  const data = (await resp.json()) as { value: string[] };
  const isMember = Array.isArray(data.value) && data.value.includes(tenantGroupId);

  _cache.set(key, { result: isMember, expiresAt: now + CACHE_TTL_MS });

  return isMember;
}

/** Clears the in-memory group-check cache (used in tests). */
export function clearGroupCheckCache(): void {
  _cache.clear();
}
