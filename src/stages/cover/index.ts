import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { RuntimeContext } from '../../shared/runtime.js';
import { jobs } from '../../db/schema.js';
import { callJsonModel, coverSchema } from '../../shared/llm.js';
import { errorMessage } from '../../shared/errors.js';
import { runWithConcurrency } from '../../shared/concurrency.js';
import { jobIdFromUrl } from '../../shared/utils.js';

interface CoverOptions {
  minScore?: number;
  retryFailed?: boolean;
}

export async function runCoverStage(ctx: RuntimeContext, options: CoverOptions = {}) {
  const maxAttempts = ctx.config.pipeline.maxAttemptsPerStage;
  const minScore = options.minScore ?? ctx.config.pipeline.defaultMinScore;
  await mkdir(ctx.paths.coverDir, { recursive: true });

  const rows = await ctx.db
    .select()
    .from(jobs)
    .where(
      and(
        isNotNull(jobs.tailoredAt),
        isNull(jobs.coverLetterAt),
        isNotNull(jobs.fitScore),
        sql`${jobs.fitScore} >= ${minScore}`,
        lt(jobs.coverAttempts, maxAttempts),
        options.retryFailed ? isNotNull(jobs.coverError) : undefined
      )
    );

  const profileSummary = JSON.stringify(ctx.profile, null, 2);

  let succeeded = 0;
  let failed = 0;

  await runWithConcurrency(rows, ctx.config.pipeline.coverConcurrency, async (job) => {
    const attempt = (job.coverAttempts ?? 0) + 1;
    const id = jobIdFromUrl(job.url);
    const mdPath = join(ctx.paths.coverDir, `${id}.md`);
    const txtPath = join(ctx.paths.coverDir, `${id}.txt`);

    try {
      const tailoredResume = job.tailoredResumePath ? await readFile(job.tailoredResumePath, 'utf8') : '';
      const response = await callJsonModel(
        ctx,
        {
          system: 'You are a precise cover letter writer. Output JSON only.',
          user:
            `Schema: {"coverLetterMarkdown": string, "tone": string}.\n` +
            `Write a specific, evidence-based cover letter tailored to the job.\n\n` +
            `Candidate profile:\n${profileSummary}\n\nTailored resume:\n${tailoredResume}\n\n` +
            `Job title: ${job.title}\nJob description:\n${job.fullDescription ?? job.description ?? ''}`
        },
        coverSchema,
        { parseRetries: 2 }
      );

      await writeFile(mdPath, response.coverLetterMarkdown, 'utf8');
      await writeFile(txtPath, `${response.coverLetterMarkdown}\n\nTone: ${response.tone}`, 'utf8');

      await ctx.db
        .update(jobs)
        .set({
          coverLetterPath: mdPath,
          coverLetterTextPath: txtPath,
          coverLetterAt: new Date(),
          coverError: null,
          coverAttempts: attempt
        })
        .where(eq(jobs.url, job.url));
      succeeded += 1;
    } catch (error) {
      failed += 1;
      await ctx.db
        .update(jobs)
        .set({
          coverAttempts: attempt,
          coverError: errorMessage(error)
        })
        .where(eq(jobs.url, job.url));
      ctx.logger.warn({ url: job.url, err: error }, 'cover generation failed');
    }
  });

  return {
    processed: rows.length,
    succeeded,
    failed
  };
}
