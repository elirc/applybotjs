import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { getApplybotPaths } from '../shared/appPaths.js';
import * as schema from './schema.js';

export function createDb(dbPath?: string) {
  const resolvedPath = dbPath ?? getApplybotPaths().dbPath;
  const sqlite = new Database(resolvedPath);
  sqlite.pragma('journal_mode = WAL');
  return drizzle(sqlite, { schema });
}

export type ApplybotDb = ReturnType<typeof createDb>;
