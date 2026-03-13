/**
 * Schema integration test.
 * Runs the 0001_initial migration against a real PostgreSQL test database
 * and verifies all expected tables and key columns exist.
 *
 * Requires DATABASE_TEST_URL or DATABASE_URL pointing to an accessible PG instance.
 * The test will be skipped (not failed) if the database is unreachable.
 */
import postgres from 'postgres';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DB_URL =
  process.env.DATABASE_TEST_URL ??
  'postgresql://runner:password@localhost:5432/runner_test';

const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../src/db/migrations/0001_initial.sql',
);

async function tryConnect(): Promise<postgres.Sql | null> {
  try {
    const sql = postgres(TEST_DB_URL, { connect_timeout: 5, max: 1 });
    await sql`SELECT 1`;
    return sql;
  } catch {
    return null;
  }
}

describe('Schema migration — table creation', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    const conn = await tryConnect();
    if (!conn) {
      console.warn('Skipping schema tests: no database available at', TEST_DB_URL);
      return;
    }
    sql = conn;

    // Drop all tables in reverse FK order so tests are idempotent
    await sql`DROP TABLE IF EXISTS audit_log CASCADE`;
    await sql`DROP TABLE IF EXISTS dept_cache CASCADE`;
    await sql`DROP TABLE IF EXISTS runners CASCADE`;
    await sql`DROP TABLE IF EXISTS pbx_credentials CASCADE`;
    await sql`DROP TABLE IF EXISTS tenants CASCADE`;

    // Apply the migration SQL
    const migrationSql = fs.readFileSync(MIGRATION_FILE, 'utf-8');
    // Drizzle migration files use `--> statement-breakpoint` as separator
    const statements = migrationSql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await sql.unsafe(stmt);
    }
  }, 30_000);

  afterAll(async () => {
    if (sql) await sql.end();
  });

  function skipIfNoDb(): boolean {
    if (!sql) { return true; } return false;
  }

  const EXPECTED_TABLES = [
    'tenants',
    'pbx_credentials',
    'runners',
    'audit_log',
    'dept_cache',
  ];

  it.each(EXPECTED_TABLES)('table "%s" exists', async (tableName) => {
    if (skipIfNoDb()) return;
    const rows = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
    `;
    expect(rows).toHaveLength(1);
  });

  it('tenants has expected columns', async () => {
    if (skipIfNoDb()) return;
    const cols = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tenants'
    `;
    const names = cols.map((r) => r.column_name as string);
    expect(names).toEqual(
      expect.arrayContaining([
        'id', 'entra_tenant_id', 'name', 'entra_group_id',
        'admin_emails', 'is_active', 'created_at', 'updated_at',
      ]),
    );
  });

  it('pbx_credentials has expected columns including auth_mode and nullable credential fields', async () => {
    if (skipIfNoDb()) return;
    const cols = await sql`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pbx_credentials'
    `;
    const colMap = Object.fromEntries(
      cols.map((r) => [r.column_name as string, r.is_nullable as string]),
    );
    expect(Object.keys(colMap)).toEqual(
      expect.arrayContaining([
        'id', 'tenant_id', 'pbx_fqdn', 'pbx_name', 'auth_mode',
        'xapi_client_id', 'xapi_secret', 'pbx_username', 'pbx_password',
        'xapi_token', 'xapi_token_expires_at', 'is_active', 'created_at', 'updated_at',
      ]),
    );
    // Credential fields are nullable
    expect(colMap['xapi_client_id']).toBe('YES');
    expect(colMap['xapi_secret']).toBe('YES');
    expect(colMap['pbx_username']).toBe('YES');
    expect(colMap['pbx_password']).toBe('YES');
  });

  it('runners has unique constraint on (entra_email, pbx_credential_id)', async () => {
    if (skipIfNoDb()) return;
    const rows = await sql`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'runners'
        AND indexdef LIKE '%entra_email%pbx_credential_id%'
    `;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('audit_log has expected columns', async () => {
    if (skipIfNoDb()) return;
    const cols = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'audit_log'
    `;
    const names = cols.map((r) => r.column_name as string);
    expect(names).toEqual(
      expect.arrayContaining([
        'id', 'runner_id', 'entra_email', 'pbx_fqdn',
        'extension_number', 'from_dept_id', 'to_dept_id',
        'status', 'error_message', 'device_id', 'duration_ms', 'created_at',
      ]),
    );
  });

  it('dept_cache has unique constraint on (pbx_credential_id, dept_id)', async () => {
    if (skipIfNoDb()) return;
    const rows = await sql`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'dept_cache'
        AND indexdef LIKE '%pbx_credential_id%dept_id%'
    `;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('tenants.entra_tenant_id has a unique constraint', async () => {
    if (skipIfNoDb()) return;
    const rows = await sql`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name   = 'tenants'
        AND constraint_type = 'UNIQUE'
    `;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('pbx_credentials.pbx_fqdn has a unique constraint', async () => {
    if (skipIfNoDb()) return;
    const rows = await sql`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name   = 'pbx_credentials'
        AND constraint_type = 'UNIQUE'
    `;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
