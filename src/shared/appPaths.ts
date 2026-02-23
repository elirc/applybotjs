import { homedir } from 'node:os';
import { resolve } from 'node:path';

export interface ApplybotPaths {
  rootDir: string;
  configPath: string;
  profilePath: string;
  resumePath: string;
  envPath: string;
  dbPath: string;
  logsDir: string;
  tailoredDir: string;
  coverDir: string;
  pdfDir: string;
  dashboardDir: string;
}

export function getApplybotRootDir(): string {
  return process.env.APPLYBOT_DIR ?? resolve(homedir(), '.applybot');
}

export function getApplybotPaths(): ApplybotPaths {
  const rootDir = getApplybotRootDir();
  return {
    rootDir,
    configPath: resolve(rootDir, 'config.yaml'),
    profilePath: resolve(rootDir, 'profile.json'),
    resumePath: resolve(rootDir, 'resume.md'),
    envPath: resolve(rootDir, '.env'),
    dbPath: resolve(rootDir, 'applybot.db'),
    logsDir: resolve(rootDir, 'logs'),
    tailoredDir: resolve(rootDir, 'tailored_resumes'),
    coverDir: resolve(rootDir, 'cover_letters'),
    pdfDir: resolve(rootDir, 'pdfs'),
    dashboardDir: resolve(rootDir, 'dashboard')
  };
}
