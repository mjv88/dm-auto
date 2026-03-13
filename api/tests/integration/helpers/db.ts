/**
 * tests/integration/helpers/db.ts
 *
 * Shared database utilities for integration tests.
 *
 *  runTestMigrations()   — runs Drizzle migrations against the test DB (idempotent).
 *  truncateTables()      — deletes all rows from every table, respecting FK order.
 *  waitForAuditEntry()   — polls the audit_log table until a matching row appears
 *                          (accounts for the fire-and-forget setImmediate write).
 */

import path from 'path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { sql, eq, and } from 'drizzle-orm';
import * as schema from '../../../src/db/schema';

export const TEST_DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://tcxtest:tcxtest@localhost:5433/tcxtest';

/** Run all pending Drizzle migrations against the test database. */
export async function runTestMigrations(): Promise<void> {
  const client = postgres(TEST_DB_URL, { max: 1 });
  const db = drizzle(client);
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, '../../../src/db/migrations'),
  });
  await client.end();
}

/**
 * Truncate all application tables in dependency order.
 * Uses the Drizzle singleton already established by getDb() so the same
 * connection pool is reused across fixture setup and route handlers.
 */
export async function truncateTables(): Promise<void> {
  // Dynamic import keeps this helper usable even before getDb is initialised
  const { getDb } = await import('../../../src/db/index');
  const db = getDb();
  // CASCADE handles FK chains; explicit order ensures no FK violations even
  // without CASCADE on older Postgres versions.
  await db.execute(
    sql`TRUNCATE TABLE audit_log, dept_cache, runners, pbx_credentials, tenants CASCADE`,
  );
}

/**
 * Polls audit_log until a row matching (runnerId, status) appears,
 * or throws after maxWaitMs.
 *
 * Required because writeAuditLog uses setImmediate + fire-and-forget:
 * the HTTP response arrives before the DB insert completes.
 */
export async function waitForAuditEntry(
  runnerId: string,
  status: 'success' | 'failed' | 'denied',
  maxWaitMs = 3000,
): Promise<typeof schema.auditLog.$inferSelect> {
  const { getDb } = await import('../../../src/db/index');
  const db = getDb();
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const rows = await db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.runnerId, runnerId),
          eq(schema.auditLog.status, status),
        ),
      );
    if (rows.length > 0) return rows[0];
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(
    `Audit log entry (runnerId=${runnerId}, status=${status}) not found within ${maxWaitMs} ms`,
  );
}
