import { readFile } from 'node:fs/promises';
import { and, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import type { RuntimeContext } from '../../shared/runtime.js';
import { jobs } from '../../db/schema.js';
import { callJsonModel, scoreSchema } from '../../shared/llm.js';
import { errorMessage } from '../../shared/errors.js';
import { runWithConcurrency } from '../../shared/concurrency.js';

interface ScoreOptions {
  retryFailed?: boolean;
}

export async function runScoreStage(ctx: RuntimeContext, options: ScoreOptions = {}) {
  const maxAttempts = ctx.config.pipeline.maxAttemptsPerStage;
  const rows = await ctx.db
    .select()
    .from(jobs)
    .where(
      and(
        isNotNull(jobs.detailScrapedAt),
        isNull(jobs.scoredAt),
        lt(jobs.scoreAttempts, maxAttempts),
        options.retryFailed ? isNotNull(jobs.scoreError) : undefined
      )
    );

  const resume = await readFile(ctx.paths.resumePath, 'utf8');
  const profileSummary = JSON.stringify(ctx.profile, null, 2);

  let succeeded = 0;
  let failed = 0;

  await runWithConcurrency(rows, ctx.config.pipeline.scoreConcurrency, async (job) => {
    const attempt = (job.scoreAttempts ?? 0) + 1;
    try {
      const response = await callJsonModel(
        ctx,
        {
          system: `You are an expert recruiting analyst. Score candidate-job fit from 1-10 strictly using provided profile and resume. JSON only.`,
          user: `Schema: {"score": number 1-10, "reasoning": string}.\n\nProfile:\n${profileSummary}\n\nResume:\n${resume}\n\nJob title: ${job.title}\nJob location: ${job.location ?? 'unknown'}\nJob description:\n${job.fullDescription ?? job.description ?? ''}`
        },
        scoreSchema,
        { parseRetries: 2 }
      );

      await ctx.db
        .update(jobs)
        .set({
          fitScore: response.score,
          scoreReasoning: response.reasoning,
          scoredAt: new Date(),
          scoreError: null,
          scoreAttempts: attempt
        })
        .where(eq(jobs.url, job.url));
      succeeded += 1;
    } catch (error) {
      failed += 1;
      await ctx.db
        .update(jobs)
        .set({
          scoreAttempts: attempt,
          scoreError: errorMessage(error)
        })
        .where(eq(jobs.url, job.url));
      ctx.logger.warn({ url: job.url, err: error }, 'score failed');
    }
  });

  return {
    processed: rows.length,
    succeeded,
    failed
  };
}
