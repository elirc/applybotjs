import type { Config } from 'drizzle-kit';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

const applybotDir = process.env.APPLYBOT_DIR ?? resolve(homedir(), '.applybot');
const dbPath = process.env.APPLYBOT_DB_PATH ?? resolve(applybotDir, 'applybot.db');

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbPath
  }
} satisfies Config;
