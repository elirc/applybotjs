import type { Command } from 'commander';
import { buildRuntimeContext } from '../shared/runtime.js';
import { resolveStages, type StageName } from './stageSelection.js';
import { runDiscoverStage } from '../stages/discover/index.js';
import { runEnrichStage } from '../stages/enrich/index.js';
import { runScoreStage } from '../stages/score/index.js';
import { runTailorStage } from '../stages/tailor/index.js';
import { runCoverStage } from '../stages/cover/index.js';
import { runPdfStage } from '../stages/pdf/index.js';
import { runApplyStage } from '../stages/apply/index.js';

interface RunOptions {
  retryFailed?: boolean;
  minScore?: string;
}

export function registerRunCommand(program: Command) {
  program
    .command('run')
    .description('Run selected pipeline stages')
    .argument('[stages...]', 'Stages to run (discover enrich score tailor cover pdf apply)')
    .option('--retry-failed', 'Retry previously failed rows')
    .option('--min-score <number>', 'Minimum score threshold for tailor/cover', '7')
    .action(async (stages: string[], options: RunOptions) => {
      const selected = resolveStages(stages);
      if (selected.length === 0) {
        throw new Error('No valid stages selected');
      }

      const ctx = await buildRuntimeContext('run');
      const minScore = Number(options.minScore ?? ctx.config.pipeline.defaultMinScore);

      for (const stage of selected) {
        if (stage === 'discover') {
          const result = await runDiscoverStage(ctx);
          console.log(`[discover] fetched=${result.totalFetched} deduped=${result.inserted}`);
          continue;
        }

        if (stage === 'enrich') {
          const result = await runEnrichStage(ctx, { retryFailed: options.retryFailed });
          console.log(`[enrich] processed=${result.processed} ok=${result.succeeded} failed=${result.failed}`);
          continue;
        }

        if (stage === 'score') {
          const result = await runScoreStage(ctx, { retryFailed: options.retryFailed });
          console.log(`[score] processed=${result.processed} ok=${result.succeeded} failed=${result.failed}`);
          continue;
        }

        if (stage === 'tailor') {
          const result = await runTailorStage(ctx, { retryFailed: options.retryFailed, minScore });
          console.log(`[tailor] processed=${result.processed} ok=${result.succeeded} failed=${result.failed}`);
          continue;
        }

        if (stage === 'cover') {
          const result = await runCoverStage(ctx, { retryFailed: options.retryFailed, minScore });
          console.log(`[cover] processed=${result.processed} ok=${result.succeeded} failed=${result.failed}`);
          continue;
        }

        if (stage === 'pdf') {
          const result = await runPdfStage(ctx, { retryFailed: options.retryFailed });
          console.log(`[pdf] processed=${result.processed} ok=${result.succeeded} failed=${result.failed}`);
          continue;
        }

        if (stage === 'apply') {
          const result = await runApplyStage(ctx, {
            agent: ctx.config.apply.defaultAgent,
            dryRun: true,
            workers: 1,
            headless: ctx.config.apply.defaultHeadless,
            enableGmail: ctx.config.apply.enableGmailByDefault,
            domainAllowlist: ctx.config.apply.domainAllowlist,
            maxApplies: ctx.config.apply.defaultMaxApplies,
            minDelaySeconds: ctx.config.apply.defaultMinDelaySeconds,
            timeoutSec: 600,
            retryFailed: options.retryFailed
          });
          console.log(
            `[apply] selected=${result.selected} attempted=${result.attempted} applied=${result.applied} failed=${result.failed} review=${result.needsReview} dryRun=${result.dryRun}`
          );
        }
      }
    });
}
