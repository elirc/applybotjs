import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createDb } from './client.js';

export async function runMigrations() {
  const db = createDb();
  migrate(db, {
    migrationsFolder: './src/db/migrations'
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}
