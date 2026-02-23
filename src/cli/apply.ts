import type { Command } from 'commander';
import { buildRuntimeContext } from '../shared/runtime.js';
import { markApplied, markFailed, resetFailedApplies } from '../db/jobs.js';
import { generatePromptOnly, runApplyStage } from '../stages/apply/index.js';

interface ApplyOptions {
  agent?: 'claude' | 'codex' | 'auto';
  claudeModel?: string;
  codexModel?: string;
  dryRun?: boolean;
  workers?: string;
  headless?: boolean;
  url?: string;
  enableGmail?: boolean;
  domainAllowlist?: string;
  maxApplies?: string;
  minDelaySeconds?: string;
  markApplied?: string;
  markFailed?: string;
  failReason?: string;
  resetFailed?: boolean;
  gen?: boolean;
  retryFailed?: boolean;
}

export function registerApplyCommand(program: Command) {
  program
    .command('apply')
    .description('Run Stage 6 auto-apply with claude/codex/auto backends')
    .option('--agent <agent>', 'claude|codex|auto')
    .option('--claude-model <model>', 'Claude model override')
    .option('--codex-model <model>', 'Codex model override')
    .option('--dry-run', 'Run without final submission')
    .option('--workers <number>', 'Number of parallel workers', '1')
    .option('--headless', 'Run browser headless')
    .option('--url <url>', 'Apply only to a specific job URL')
    .option('--enable-gmail', 'Enable Gmail MCP server')
    .option('--domain-allowlist <domains>', 'Comma separated domain allowlist override')
    .option('--max-applies <number>', 'Maximum applies this run')
    .option('--min-delay-seconds <number>', 'Minimum delay between worker actions')
    .option('--mark-applied <url>', 'Mark specific URL as applied')
    .option('--mark-failed <url>', 'Mark specific URL as failed')
    .option('--fail-reason <text>', 'Failure reason for --mark-failed', 'manually marked failed')
    .option('--reset-failed', 'Reset failed apply rows for retry')
    .option('--gen', 'Generate prompt and backend command only (requires --url)')
    .option('--retry-failed', 'Include failed rows in queue')
    .action(async (options: ApplyOptions) => {
      const ctx = await buildRuntimeContext('apply');

      if (options.markApplied) {
        await markApplied(ctx.db, options.markApplied);
        console.log(`Marked applied: ${options.markApplied}`);
        return;
      }

      if (options.markFailed) {
        await markFailed(ctx.db, options.markFailed, options.failReason ?? 'manually marked failed');
        console.log(`Marked failed: ${options.markFailed}`);
        return;
      }

      if (options.resetFailed) {
        await resetFailedApplies(ctx.db);
        console.log('Reset failed apply rows.');
        return;
      }

      const resolvedAllowlist = options.domainAllowlist
        ? options.domainAllowlist
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : ctx.config.apply.domainAllowlist;

      const applyOptions = {
        agent: options.agent ?? ctx.config.apply.defaultAgent,
        claudeModel: options.claudeModel,
        codexModel: options.codexModel,
        dryRun: options.dryRun ?? false,
        workers: Number(options.workers ?? 1),
        headless: options.headless ?? ctx.config.apply.defaultHeadless,
        url: options.url,
        enableGmail: options.enableGmail ?? ctx.config.apply.enableGmailByDefault,
        domainAllowlist: resolvedAllowlist,
        maxApplies: Number(options.maxApplies ?? ctx.config.apply.defaultMaxApplies),
        minDelaySeconds: Number(options.minDelaySeconds ?? ctx.config.apply.defaultMinDelaySeconds),
        timeoutSec: 600,
        retryFailed: options.retryFailed ?? false,
        genOnly: options.gen ?? false
      } as const;

      if (options.gen) {
        const generated = await generatePromptOnly(ctx, applyOptions);
        console.log(`Prompt generated: ${generated.promptPath}`);
        console.log('Manual backend command:');
        console.log(generated.command);
        return;
      }

      const result = await runApplyStage(ctx, applyOptions);
      console.log('Apply summary:');
      console.table([result]);
      if (result.interrupted) {
        console.log('Run interrupted. In-progress jobs were marked failed/interrupted.');
      }
    });
}
