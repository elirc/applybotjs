import { mkdir } from 'node:fs/promises';
import { createDb } from '../db/client.js';
import { loadConfigAndProfile, type LoadedConfig } from '../config/schema.js';
import { createLogger } from './logger.js';

export interface RuntimeContext extends LoadedConfig {
  db: ReturnType<typeof createDb>;
  logger: ReturnType<typeof createLogger>;
}

export async function buildRuntimeContext(component: string): Promise<RuntimeContext> {
  const loaded = await loadConfigAndProfile();
  await mkdir(loaded.paths.rootDir, { recursive: true });
  await mkdir(loaded.paths.logsDir, { recursive: true });
  await mkdir(loaded.paths.tailoredDir, { recursive: true });
  await mkdir(loaded.paths.coverDir, { recursive: true });
  await mkdir(loaded.paths.pdfDir, { recursive: true });
  await mkdir(loaded.paths.dashboardDir, { recursive: true });

  return {
    ...loaded,
    db: createDb(loaded.paths.dbPath),
    logger: createLogger(component)
  };
}
