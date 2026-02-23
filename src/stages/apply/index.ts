import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { RuntimeContext } from '../../shared/runtime.js';
import { jobs, type Job } from '../../db/schema.js';
import { getJobsReadyToApply } from '../../db/jobs.js';
import { buildApplyPrompt } from './prompt.js';
import { writeWorkerConfigs } from './mcpConfig.js';
import { startChromeCdp, stopChromeCdp } from './chrome.js';
import { ClaudeRunner } from './agents/claudeRunner.js';
import { CodexRunner } from './agents/codexRunner.js';
import type { AgentRunResult, ParsedOutcome } from './agents/base.js';
import { sleep } from '../../shared/utils.js';

export interface ApplyStageOptions {
  agent: 'claude' | 'codex' | 'auto';
  claudeModel?: string;
  codexModel?: string;
  dryRun: boolean;
  workers: number;
  headless: boolean;
  url?: string;
  enableGmail: boolean;
  domainAllowlist: string[];
  maxApplies: number;
  minDelaySeconds: number;
  timeoutSec: number;
  retryFailed?: boolean;
  genOnly?: boolean;
}

interface ApplySummary {
  selected: number;
  attempted: number;
  applied: number;
  failed: number;
  captcha: number;
  needsReview: number;
  dryRun: number;
  interrupted: boolean;
}

function sanitizeFile(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function isAllowedDomain(rawUrl: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) {
    return true;
  }

  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    return allowlist.some((domain) => {
      const normalized = domain.toLowerCase().trim();
      return hostname === normalized || hostname.endsWith(`.${normalized}`);
    });
  } catch {
    return false;
  }
}

function fallbackParseIndicator(outcome: ParsedOutcome): boolean {
  return outcome.status === 'NEEDS_REVIEW' && /No RESULT line or valid JSON terminal output found/i.test(outcome.reason);
}

function mapOutcomeToDbStatus(outcome: ParsedOutcome): string {
  return outcome.status;
}

export async function generatePromptOnly(ctx: RuntimeContext, options: ApplyStageOptions): Promise<{ promptPath: string; command: string }> {
  if (!options.url) {
    throw new Error('--gen requires --url');
  }

  const [job] = await ctx.db.select().from(jobs).where(eq(jobs.url, options.url)).limit(1);
  if (!job) {
    throw new Error(`No job found for url: ${options.url}`);
  }

  const prompt = buildApplyPrompt({
    job,
    profile: ctx.profile,
    dryRun: options.dryRun,
    domainAllowlist: options.domainAllowlist,
    minDelaySeconds: options.minDelaySeconds,
    resumePdfPath: job.resumePdfPath,
    coverPdfPath: job.coverPdfPath
  });

  const runId = `${Date.now()}-${sanitizeFile(job.title)}`;
  const promptPath = join(ctx.paths.logsDir, `${runId}.prompt.txt`);
  await writeFile(promptPath, prompt, 'utf8');

  let command: string;
  if (options.agent === 'codex') {
    command = `codex exec --json --model ${options.codexModel ?? 'gpt-5-codex'} \"$(cat ${promptPath})\"`;
  } else if (options.agent === 'claude') {
    command = `claude -p \"$(cat ${promptPath})\" --mcp-config <worker-mcp-config.json> --model ${options.claudeModel ?? 'sonnet'}`;
  } else {
    command = `# auto mode\nclaude -p \"$(cat ${promptPath})\" --mcp-config <worker-mcp-config.json> || codex exec --json \"$(cat ${promptPath})\"`;
  }

  return { promptPath, command };
}

export async function runApplyStage(ctx: RuntimeContext, options: ApplyStageOptions): Promise<ApplySummary> {
  const maxAttempts = ctx.config.pipeline.maxAttemptsPerStage;
  const rows = await getJobsReadyToApply(ctx.db, maxAttempts, options.maxApplies, options.url, options.retryFailed ?? false);

  const summary: ApplySummary = {
    selected: rows.length,
    attempted: 0,
    applied: 0,
    failed: 0,
    captcha: 0,
    needsReview: 0,
    dryRun: 0,
    interrupted: false
  };

  if (rows.length === 0) {
    return summary;
  }

  const workersRoot = join(ctx.paths.logsDir, 'workers');
  await mkdir(workersRoot, { recursive: true });

  let aborted = false;
  const abortController = new AbortController();
  const inProgress = new Map<string, string>();
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  const onSignal = () => {
    aborted = true;
    abortController.abort();
  };

  for (const signal of signals) {
    process.once(signal, onSignal);
  }

  let index = 0;
  let appliedCount = 0;

  const workerPromises = Array.from({ length: Math.max(1, options.workers) }, async (_, workerIndex) => {
    const workerId = `worker-${workerIndex + 1}`;
    const workerDir = join(workersRoot, workerId);
    await mkdir(workerDir, { recursive: true });

    const chrome = await startChromeCdp({
      port: 9333 + workerIndex,
      userDataDir: join(workerDir, 'chrome-profile'),
      headless: options.headless
    });

    try {
      const configs = await writeWorkerConfigs({
        workersRoot,
        workerId,
        cdpEndpoint: chrome.endpoint,
        enableGmail: options.enableGmail
      });

      while (true) {
        if (aborted || appliedCount >= options.maxApplies) {
          return;
        }

        const current = index;
        index += 1;
        if (current >= rows.length) {
          return;
        }

        const job = rows[current];
        if (!isAllowedDomain(job.applicationUrl ?? job.url, options.domainAllowlist)) {
          await ctx.db
            .update(jobs)
            .set({
              applyStatus: 'FAILED',
              applyError: 'Domain not allowlisted',
              lastAttemptedAt: new Date()
            })
            .where(eq(jobs.url, job.url));
          summary.failed += 1;
          continue;
        }

        const prompt = buildApplyPrompt({
          job,
          profile: ctx.profile,
          dryRun: options.dryRun,
          domainAllowlist: options.domainAllowlist,
          minDelaySeconds: options.minDelaySeconds,
          resumePdfPath: job.resumePdfPath,
          coverPdfPath: job.coverPdfPath
        });

        const runId = `${Date.now()}-${workerId}-${sanitizeFile(job.title)}`;
        const promptPath = join(ctx.paths.logsDir, `${runId}.prompt.txt`);
        await writeFile(promptPath, prompt, 'utf8');

        if (options.genOnly) {
          continue;
        }

        const attempt = (job.applyAttempts ?? 0) + 1;
        inProgress.set(job.url, workerId);
        await ctx.db
          .update(jobs)
          .set({
            applyAttempts: attempt,
            lastAttemptedAt: new Date(),
            applyTaskId: runId,
            applyStatus: 'RUNNING',
            applyError: null
          })
          .where(eq(jobs.url, job.url));

        let result: AgentRunResult | null = null;

        const runClaude = async () => {
          const runner = new ClaudeRunner({
            model: options.claudeModel,
            mcpConfigPath: configs.claudeMcpPath,
            rawLogPath: join(ctx.paths.logsDir, `${runId}.claude.log.txt`)
          });
          return runner.run(prompt, {
            workdir: configs.workerDir,
            timeoutSec: options.timeoutSec,
            signal: abortController.signal
          });
        };

        const runCodex = async () => {
          const runner = new CodexRunner({
            model: options.codexModel,
            rawLogPath: join(ctx.paths.logsDir, `${runId}.codex.final.txt`),
            eventsPath: join(ctx.paths.logsDir, `${runId}.codex.events.jsonl`)
          });
          return runner.run(prompt, {
            workdir: configs.workerDir,
            timeoutSec: options.timeoutSec,
            signal: abortController.signal
          });
        };

        try {
          if (options.agent === 'claude') {
            result = await runClaude();
          } else if (options.agent === 'codex') {
            result = await runCodex();
          } else {
            try {
              const claude = await runClaude();
              if (claude.exitCode !== 0 && fallbackParseIndicator(claude.parsed)) {
                result = await runCodex();
              } else {
                result = claude;
              }
            } catch {
              result = await runCodex();
            }
          }

          if (!result) {
            throw new Error('No runner produced a result');
          }

          const parsed =
            options.dryRun && result.parsed.status === 'APPLIED'
              ? { ...result.parsed, status: 'DRY_RUN' as const, submitted: false, reason: 'Dry-run mode enforced' }
              : result.parsed;

          const status = mapOutcomeToDbStatus(parsed);
          summary.attempted += 1;

          if (status === 'APPLIED') {
            appliedCount += 1;
            summary.applied += 1;
          } else if (status === 'FAILED') {
            summary.failed += 1;
          } else if (status === 'CAPTCHA') {
            summary.captcha += 1;
          } else if (status === 'DRY_RUN') {
            summary.dryRun += 1;
          } else {
            summary.needsReview += 1;
          }

          await ctx.db
            .update(jobs)
            .set({
              applyStatus: status,
              applyError: status === 'APPLIED' ? null : parsed.reason,
              appliedAt: status === 'APPLIED' ? new Date() : null,
              applyDurationMs: result.durationMs,
              lastAttemptedAt: new Date(),
              agentId: result.engine,
              applyTaskId: runId
            })
            .where(eq(jobs.url, job.url));
        } catch (error) {
          summary.failed += 1;
          await ctx.db
            .update(jobs)
            .set({
              applyStatus: 'FAILED',
              applyError: error instanceof Error ? error.message : String(error),
              lastAttemptedAt: new Date(),
              applyTaskId: runId
            })
            .where(eq(jobs.url, job.url));
        } finally {
          inProgress.delete(job.url);
        }

        if (options.minDelaySeconds > 0) {
          await sleep(options.minDelaySeconds * 1000);
        }
      }
    } finally {
      await stopChromeCdp(chrome);
    }
  });

  await Promise.all(workerPromises);

  if (aborted && inProgress.size > 0) {
    summary.interrupted = true;
    for (const [url] of inProgress.entries()) {
      await ctx.db
        .update(jobs)
        .set({
          applyStatus: 'FAILED',
          applyError: 'Interrupted by signal',
          lastAttemptedAt: new Date()
        })
        .where(eq(jobs.url, url));
      summary.failed += 1;
    }
  }

  for (const signal of signals) {
    process.removeListener(signal, onSignal);
  }

  return summary;
}
