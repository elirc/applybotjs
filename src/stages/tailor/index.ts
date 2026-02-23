import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { and, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { RuntimeContext } from '../../shared/runtime.js';
import { jobs } from '../../db/schema.js';
import { callJsonModel, tailorSchema } from '../../shared/llm.js';
import { errorMessage } from '../../shared/errors.js';
import { runWithConcurrency } from '../../shared/concurrency.js';
import { jobIdFromUrl } from '../../shared/utils.js';
import { join } from 'node:path';

interface TailorOptions {
  minScore?: number;
  retryFailed?: boolean;
}

export async function runTailorStage(ctx: RuntimeContext, options: TailorOptions = {}) {
  const maxAttempts = ctx.config.pipeline.maxAttemptsPerStage;
  const minScore = options.minScore ?? ctx.config.pipeline.defaultMinScore;
  await mkdir(ctx.paths.tailoredDir, { recursive: true });

  const rows = await ctx.db
    .select()
    .from(jobs)
    .where(
      and(
        isNotNull(jobs.scoredAt),
        isNull(jobs.tailoredAt),
        isNotNull(jobs.fitScore),
        sql`${jobs.fitScore} >= ${minScore}`,
        lt(jobs.tailorAttempts, maxAttempts),
        options.retryFailed ? isNotNull(jobs.tailorError) : undefined
      )
    );

  const resume = await readFile(ctx.paths.resumePath, 'utf8');
  const profileSummary = JSON.stringify(ctx.profile, null, 2);

  let succeeded = 0;
  let failed = 0;

  await runWithConcurrency(rows, ctx.config.pipeline.tailorConcurrency, async (job) => {
    const attempt = (job.tailorAttempts ?? 0) + 1;
    const id = jobIdFromUrl(job.url);
    const mdPath = join(ctx.paths.tailoredDir, `${id}.md`);
    const txtPath = join(ctx.paths.tailoredDir, `${id}.txt`);
    try {
      const response = await callJsonModel(
        ctx,
        {
          system: 'You are a staff technical resume writer. Return JSON only.',
          user:
            `Schema: {"resumeMarkdown": string, "highlights": string[]}.\n` +
            `Create a tailored resume markdown for this specific role while keeping content truthful.\n\n` +
            `Profile:\n${profileSummary}\n\nBase resume:\n${resume}\n\nJob title: ${job.title}\nDescription:\n${job.fullDescription ?? job.description ?? ''}`
        },
        tailorSchema,
        { parseRetries: 2 }
      );

      await writeFile(mdPath, response.resumeMarkdown, 'utf8');
      await writeFile(txtPath, `${response.resumeMarkdown}\n\nHighlights:\n- ${response.highlights.join('\n- ')}`, 'utf8');

      await ctx.db
        .update(jobs)
        .set({
          tailoredResumePath: mdPath,
          tailoredResumeTextPath: txtPath,
          tailoredAt: new Date(),
          tailorError: null,
          tailorAttempts: attempt
        })
        .where(eq(jobs.url, job.url));
      succeeded += 1;
    } catch (error) {
      failed += 1;
      await ctx.db
        .update(jobs)
        .set({
          tailorAttempts: attempt,
          tailorError: errorMessage(error)
        })
        .where(eq(jobs.url, job.url));
      ctx.logger.warn({ url: job.url, err: error }, 'tailor failed');
    }
  });

  return {
    processed: rows.length,
    succeeded,
    failed
  };
}
