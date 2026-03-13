/**
 * src/entra/graphAuth.ts
 *
 * Obtains a Microsoft Graph API access token via the OAuth 2.0
 * client_credentials flow. Uses the shared platform app registration
 * (ENTRA_CLIENT_ID / ENTRA_CLIENT_SECRET) which works across all customer
 * tenants because the app is registered as multi-tenant.
 *
 * Caches the token in memory until 5 minutes before its expiry so we avoid
 * hammering the token endpoint on every Graph call.
 */

interface TokenCache {
  token: string;
  /** Unix timestamp (ms) after which the cached token must be refreshed. */
  expiresAt: number;
}

let _cache: TokenCache | null = null;

const TOKEN_ENDPOINT =
  'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';
/** Refresh 5 minutes before the real expiry. */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/**
 * Returns a valid Graph API Bearer token.
 * Result is cached until 5 minutes before expiry.
 */
export async function getGraphToken(): Promise<string> {
  const now = Date.now();

  if (_cache && _cache.expiresAt > now) {
    return _cache.token;
  }

  const clientId = process.env.ENTRA_CLIENT_ID;
  const clientSecret = process.env.ENTRA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('ENTRA_CLIENT_ID and ENTRA_CLIENT_SECRET must be set');
  }

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: GRAPH_SCOPE,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(
      `Graph token request failed: HTTP ${resp.status} — ${text}`,
    );
  }

  const data = (await resp.json()) as {
    access_token: string;
    expires_in: number;
  };

  _cache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in * 1000 - EXPIRY_BUFFER_MS),
  };

  return data.access_token;
}

/** Clears the in-memory token cache (used in tests). */
export function clearGraphTokenCache(): void {
  _cache = null;
}
