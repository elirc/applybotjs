import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import YAML from 'yaml';
import { z } from 'zod';
import { getApplybotPaths } from '../shared/appPaths.js';

const workdayTenantSchema = z.object({
  company: z.string().min(1),
  tenant: z.string().min(1),
  site: z.string().min(1)
});

const jsonBoardFeedSchema = z.object({
  name: z.string().min(1),
  url: z.url(),
  mappings: z.object({
    title: z.string().min(1),
    url: z.string().min(1),
    location: z.string().optional(),
    description: z.string().optional(),
    salary: z.string().optional(),
    date: z.string().optional()
  })
});

export const configSchema = z.object({
  pipeline: z.object({
    defaultMinScore: z.number().default(7),
    maxAttemptsPerStage: z.number().int().positive().default(3),
    pollIntervalSeconds: z.number().int().positive().default(60),
    scoreConcurrency: z.number().int().positive().default(3),
    tailorConcurrency: z.number().int().positive().default(2),
    coverConcurrency: z.number().int().positive().default(2)
  }),
  discovery: z.object({
    rssFeeds: z.array(z.url()).default([]),
    workdayTenants: z.array(workdayTenantSchema).default([]),
    jsonBoardFeeds: z.array(jsonBoardFeedSchema).default([])
  }),
  llm: z.object({
    provider: z.enum(['openai', 'anthropic', 'ollama']),
    model: z.string().min(1),
    temperature: z.number().min(0).max(2).default(0.2)
  }),
  apply: z.object({
    defaultAgent: z.enum(['claude', 'codex', 'auto']).default('auto'),
    defaultMaxApplies: z.number().int().positive().default(25),
    defaultMinDelaySeconds: z.number().int().nonnegative().default(10),
    defaultHeadless: z.boolean().default(true),
    enableGmailByDefault: z.boolean().default(false),
    domainAllowlist: z.array(z.string().min(1)).default([])
  }),
  paths: z
    .object({
      logsDir: z.string().optional(),
      tailoredDir: z.string().optional(),
      coverDir: z.string().optional(),
      pdfDir: z.string().optional(),
      dashboardDir: z.string().optional()
    })
    .optional()
    .nullable()
});

export type ApplybotConfig = z.infer<typeof configSchema>;

export const profileSchema = z.object({
  personal: z.object({
    name: z.string().min(1),
    email: z.email(),
    phone: z.string().min(1),
    address: z.string().min(1),
    linkedin: z.string().optional(),
    github: z.string().optional(),
    portfolio: z.string().optional()
  }),
  workAuthorization: z.object({
    country: z.string().min(1),
    authorized: z.boolean(),
    requiresSponsorship: z.boolean()
  }),
  compensation: z.object({
    currency: z.string().default('USD'),
    minimumBase: z.number().nonnegative().optional(),
    preferredBase: z.number().nonnegative().optional()
  }),
  experienceSummary: z.string().min(1),
  screeningDefaults: z.object({
    eeoDisclosureConsent: z.boolean().default(true),
    veteranStatus: z.string().optional(),
    disabilityStatus: z.string().optional(),
    gender: z.string().optional(),
    race: z.string().optional(),
    workAuthorizationAnswer: z.string().optional(),
    sponsorshipAnswer: z.string().optional()
  })
});

export type ApplybotProfile = z.infer<typeof profileSchema>;

export interface LoadedConfig {
  config: ApplybotConfig;
  profile: ApplybotProfile;
  paths: ReturnType<typeof getApplybotPaths>;
}

export async function loadConfigAndProfile(): Promise<LoadedConfig> {
  const paths = getApplybotPaths();

  if (existsSync(paths.envPath)) {
    loadDotenv({ path: paths.envPath, override: true });
  }

  const rawConfig = await readFile(paths.configPath, 'utf8');
  const parsedConfig = configSchema.parse(YAML.parse(rawConfig) ?? {});

  const rawProfile = await readFile(paths.profilePath, 'utf8');
  const profile = profileSchema.parse(JSON.parse(rawProfile));

  const overridePaths = parsedConfig.paths;
  if (overridePaths?.logsDir) {
    paths.logsDir = resolve(overridePaths.logsDir);
  }
  if (overridePaths?.tailoredDir) {
    paths.tailoredDir = resolve(overridePaths.tailoredDir);
  }
  if (overridePaths?.coverDir) {
    paths.coverDir = resolve(overridePaths.coverDir);
  }
  if (overridePaths?.pdfDir) {
    paths.pdfDir = resolve(overridePaths.pdfDir);
  }
  if (overridePaths?.dashboardDir) {
    paths.dashboardDir = resolve(overridePaths.dashboardDir);
  }

  return {
    config: parsedConfig,
    profile,
    paths
  };
}

export async function validateConfigFile(configPath: string) {
  const rawConfig = await readFile(configPath, 'utf8');
  return configSchema.safeParse(YAML.parse(rawConfig) ?? {});
}
