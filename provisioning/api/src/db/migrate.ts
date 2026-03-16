import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(connectionUrl?: string): Promise<void> {
  const dbUrl = connectionUrl ?? process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  const client = postgres(dbUrl, { max: 1 });
  const db = drizzle(client);
  const migrationsFolder = path.resolve(__dirname, 'migrations');

  console.info('Running database migrations from', migrationsFolder);
  await migrate(db, { migrationsFolder });
  console.info('Migrations complete');

  await client.end();
}

// Allow direct execution: `node dist/db/migrate.js`
// ESM-compatible check
const isMain = import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  runMigrations().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
