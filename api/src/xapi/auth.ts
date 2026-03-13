import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { pbxCredentials } from '../db/schema.js';
import { encrypt, decrypt } from '../utils/encrypt.js';

type DrizzleDb = ReturnType<typeof getDb>;

/**
 * Returns a valid Bearer token for the given PBX FQDN.
 *
 * Checks the pbx_credentials table for a cached token. If the cached token
 * is still valid (within the 5-minute expiry buffer) it is returned as-is.
 * Otherwise a new token is fetched via OAuth 2.0 client_credentials and the
 * result is encrypted and stored back into the table.
 *
 * @param pbxFqdn   Fully-qualified domain name of the PBX (e.g. "pbx.example.com")
 * @param dbOverride  Optional DB instance for dependency injection in tests
 */
export async function getXAPIToken(pbxFqdn: string, dbOverride?: DrizzleDb): Promise<string> {
  const db = dbOverride ?? getDb();

  const rows = await db
    .select({
      xapiToken:          pbxCredentials.xapiToken,
      xapiTokenExpiresAt: pbxCredentials.xapiTokenExpiresAt,
      xapiClientId:       pbxCredentials.xapiClientId,
      xapiSecret:         pbxCredentials.xapiSecret,
    })
    .from(pbxCredentials)
    .where(eq(pbxCredentials.pbxFqdn, pbxFqdn))
    .limit(1);

  const cred = rows[0];
  if (!cred) {
    throw new Error(`No credentials found for PBX: ${pbxFqdn}`);
  }

  // Return cached token if it is still valid (5-minute buffer is already baked
  // in when we store the expiry, so a simple "now < expires" check suffices).
  if (cred.xapiToken && cred.xapiTokenExpiresAt && cred.xapiTokenExpiresAt > new Date()) {
    return decrypt(cred.xapiToken);
  }

  // Refresh — client_id and client_secret must be present
  if (!cred.xapiClientId || !cred.xapiSecret) {
    throw new Error(`xAPI credentials (client_id / secret) missing for PBX: ${pbxFqdn}`);
  }

  const res = await fetch(`https://${pbxFqdn}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     decrypt(cred.xapiClientId),
      client_secret: decrypt(cred.xapiSecret),
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed for ${pbxFqdn}: HTTP ${res.status}`);
  }

  const { access_token, expires_in } = await res.json() as {
    access_token: string;
    expires_in:   number;
  };

  // Cache with a 5-minute buffer before the real expiry
  await db
    .update(pbxCredentials)
    .set({
      xapiToken:          encrypt(access_token),
      xapiTokenExpiresAt: new Date(Date.now() + (expires_in - 300) * 1000),
    })
    .where(eq(pbxCredentials.pbxFqdn, pbxFqdn));

  return access_token;
}
