import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb(connectionUrl?: string): ReturnType<typeof drizzle<typeof schema>> {
  if (_db) return _db;
  const url = connectionUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  _client = postgres(url);
  _db = drizzle(_client, { schema });
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_client) {
    await _client.end();
    _client = null;
    _db = null;
  }
}

export { schema };
