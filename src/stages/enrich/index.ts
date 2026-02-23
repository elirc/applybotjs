import { and, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import type { RuntimeContext } from '../../shared/runtime.js';
import { jobs, type Job } from '../../db/schema.js';
import { errorMessage } from '../../shared/errors.js';

interface EnrichOptions {
  retryFailed?: boolean;
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function enrichJob(job: Job): Promise<{ fullDescription: string; applicationUrl: string }> {
  const response = await fetch(job.url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'applybot/0.1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch job URL (${response.status})`);
  }

  const finalUrl = response.url || job.url;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const json = (await response.json()) as Record<string, unknown>;
    const description =
      (typeof json.description === 'string' && json.description) ||
      (typeof json.content === 'string' && json.content) ||
      (typeof json.jobDescription === 'string' && json.jobDescription) ||
      JSON.stringify(json);

    return {
      fullDescription: stripHtml(description),
      applicationUrl: finalUrl
    };
  }

  const html = await response.text();
  const root = stripHtml(html);

  const applicationUrlMatch = html.match(/href=["']([^"']*(apply|application|job|careers)[^"']*)["']/i);
  const applicationUrl = applicationUrlMatch
    ? new URL(applicationUrlMatch[1], finalUrl).toString()
    : finalUrl;

  return {
    fullDescription: root,
    applicationUrl
  };
}

export async function runEnrichStage(ctx: RuntimeContext, opts: EnrichOptions = {}) {
  const maxAttempts = ctx.config.pipeline.maxAttemptsPerStage;
  const selected = await ctx.db
    .select()
    .from(jobs)
    .where(
      and(
        isNull(jobs.detailScrapedAt),
        lt(jobs.detailAttempts, maxAttempts),
        opts.retryFailed ? isNotNull(jobs.detailError) : undefined
      )
    );

  let succeeded = 0;
  let failed = 0;

  for (const job of selected) {
    const attempt = (job.detailAttempts ?? 0) + 1;
    try {
      const result = await enrichJob(job);
      await ctx.db
        .update(jobs)
        .set({
          fullDescription: result.fullDescription,
          applicationUrl: result.applicationUrl,
          detailScrapedAt: new Date(),
          detailError: null,
          detailAttempts: attempt
        })
        .where(eq(jobs.url, job.url));
      succeeded += 1;
    } catch (error) {
      await ctx.db
        .update(jobs)
        .set({
          detailAttempts: attempt,
          detailError: errorMessage(error)
        })
        .where(eq(jobs.url, job.url));
      failed += 1;
      ctx.logger.warn({ url: job.url, err: error }, 'enrichment failed');
    }
  }

  return { processed: selected.length, succeeded, failed };
}


