import { eq, and, lte } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { pbxCredentials } from '../db/schema.js';
import { encrypt, decrypt } from '../utils/encrypt.js';

// Lazy logger import to avoid pulling in config.ts during unit tests
// (config.ts calls process.exit when env vars are missing)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LogFn = (...args: any[]) => void;

function getLogger(): { info: LogFn; debug: LogFn; error: LogFn } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../utils/logger.js').logger;
}

type DrizzleDb = ReturnType<typeof getDb>;

// ── Per-PBX mutex ────────────────────────────────────────────────────────────
// Prevents concurrent token refreshes for the same PBX.

const inflight = new Map<string, Promise<string>>();

// ── Background refresh interval ──────────────────────────────────────────────

/** How often the background loop runs (50 minutes). */
const REFRESH_INTERVAL_MS = 50 * 60 * 1000;

/** Refresh tokens expiring within this window (10 minutes). */
const REFRESH_AHEAD_MS = 10 * 60 * 1000;

/** 5-minute buffer subtracted from actual expiry when storing. */
const EXPIRY_BUFFER_SECONDS = 300;

let refreshTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Returns a valid Bearer token for the given PBX FQDN.
 */
export async function getXAPIToken(pbxFqdn: string, dbOverride?: DrizzleDb): Promise<string> {
  const db = dbOverride ?? getDb();

  // Fast path: return cached token if valid
  const cached = await getCachedToken(db, pbxFqdn);
  if (cached) return cached;

  // Slow path: acquire per-PBX mutex and refresh
  const existing = inflight.get(pbxFqdn);
  if (existing) {
    return existing;
  }

  const refreshPromise = refreshToken(db, pbxFqdn);
  inflight.set(pbxFqdn, refreshPromise);

  try {
    return await refreshPromise;
  } finally {
    inflight.delete(pbxFqdn);
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

async function getCachedToken(db: DrizzleDb, pbxFqdn: string): Promise<string | null> {
  const rows = await db
    .select({
      xapiToken:          pbxCredentials.xapiToken,
      xapiTokenExpiresAt: pbxCredentials.xapiTokenExpiresAt,
    })
    .from(pbxCredentials)
    .where(eq(pbxCredentials.pbxFqdn, pbxFqdn))
    .limit(1);

  const cred = rows[0];
  if (!cred) return null;

  if (cred.xapiToken && cred.xapiTokenExpiresAt && cred.xapiTokenExpiresAt > new Date()) {
    return decrypt(cred.xapiToken);
  }

  return null;
}

async function refreshToken(db: DrizzleDb, pbxFqdn: string): Promise<string> {
  // Re-check cache after acquiring mutex
  const cached = await getCachedToken(db, pbxFqdn);
  if (cached) return cached;

  const rows = await db
    .select({
      xapiClientId: pbxCredentials.xapiClientId,
      xapiSecret:   pbxCredentials.xapiSecret,
    })
    .from(pbxCredentials)
    .where(eq(pbxCredentials.pbxFqdn, pbxFqdn))
    .limit(1);

  const cred = rows[0];
  if (!cred) {
    throw new Error(`No credentials found for PBX: ${pbxFqdn}`);
  }

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

  // Cache with 5-minute buffer before the real expiry
  await db
    .update(pbxCredentials)
    .set({
      xapiToken:          encrypt(access_token),
      xapiTokenExpiresAt: new Date(Date.now() + (expires_in - EXPIRY_BUFFER_SECONDS) * 1000),
    })
    .where(eq(pbxCredentials.pbxFqdn, pbxFqdn));

  return access_token;
}

// ── Background refresh service ───────────────────────────────────────────────

async function refreshExpiringSoon(): Promise<void> {
  try {
    const db = getDb();
    const threshold = new Date(Date.now() + REFRESH_AHEAD_MS);

    const expiring = await db
      .select({ pbxFqdn: pbxCredentials.pbxFqdn })
      .from(pbxCredentials)
      .where(
        and(
          eq(pbxCredentials.isActive, true),
          eq(pbxCredentials.authMode, 'xapi'),
          lte(pbxCredentials.xapiTokenExpiresAt, threshold),
        ),
      );

    const noToken = await db
      .select({ pbxFqdn: pbxCredentials.pbxFqdn })
      .from(pbxCredentials)
      .where(
        and(
          eq(pbxCredentials.isActive, true),
          eq(pbxCredentials.authMode, 'xapi'),
        ),
      );

    const fqdnsToRefresh = new Set<string>();
    for (const row of expiring) fqdnsToRefresh.add(row.pbxFqdn);
    for (const row of noToken) {
      const cached = await getCachedToken(db, row.pbxFqdn);
      if (!cached) fqdnsToRefresh.add(row.pbxFqdn);
    }

    if (fqdnsToRefresh.size === 0) return;

    getLogger().info({ count: fqdnsToRefresh.size }, 'Background token refresh: refreshing expiring PBX tokens');

    for (const fqdn of fqdnsToRefresh) {
      try {
        await getXAPIToken(fqdn, db);
        getLogger().debug({ pbxFqdn: fqdn }, 'Background token refresh: success');
      } catch (err) {
        getLogger().error({ pbxFqdn: fqdn, err }, 'Background token refresh: failed');
      }
    }
  } catch (err) {
    getLogger().error({ err }, 'Background token refresh loop error');
  }
}

export function startTokenRefreshService(): void {
  if (refreshTimer) return;

  getLogger().info(
    { intervalMinutes: REFRESH_INTERVAL_MS / 60_000 },
    'Starting background xAPI token refresh service',
  );

  void refreshExpiringSoon();

  refreshTimer = setInterval(() => {
    void refreshExpiringSoon();
  }, REFRESH_INTERVAL_MS);

  if (refreshTimer.unref) refreshTimer.unref();
}

export function stopTokenRefreshService(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
    getLogger().info('Stopped background xAPI token refresh service');
  }
}
