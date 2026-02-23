import { and, asc, count, desc, eq, isNotNull, isNull, lt, notInArray, or, sql } from 'drizzle-orm';
import type { ApplybotDb } from './client.js';
import { jobs, type Job, type NewJob } from './schema.js';

export async function upsertDiscoveredJobs(db: ApplybotDb, discovered: NewJob[]) {
  if (discovered.length === 0) {
    return;
  }

  await db
    .insert(jobs)
    .values(discovered)
    .onConflictDoUpdate({
      target: jobs.url,
      set: {
        title: sql`excluded.title`,
        salary: sql`coalesce(excluded.salary, ${jobs.salary})`,
        description: sql`coalesce(excluded.description, ${jobs.description})`,
        location: sql`coalesce(excluded.location, ${jobs.location})`,
        site: sql`coalesce(excluded.site, ${jobs.site})`,
        strategy: sql`coalesce(excluded.strategy, ${jobs.strategy})`,
        source: sql`coalesce(excluded.source, ${jobs.source})`,
        discoveredAt: sql`excluded.discovered_at`
      }
    });
}

export async function getJobsForEnrichment(db: ApplybotDb, maxAttempts: number, onlyFailed = false): Promise<Job[]> {
  const base = and(
    isNull(jobs.detailScrapedAt),
    lt(jobs.detailAttempts, maxAttempts),
    onlyFailed ? isNotNull(jobs.detailError) : undefined
  );

  return db.select().from(jobs).where(base).orderBy(desc(jobs.discoveredAt));
}

export async function getJobsForScoring(
  db: ApplybotDb,
  maxAttempts: number,
  minScore: number,
  onlyFailed = false
): Promise<Job[]> {
  const where = and(
    isNotNull(jobs.detailScrapedAt),
    isNull(jobs.scoredAt),
    lt(jobs.scoreAttempts, maxAttempts),
    onlyFailed ? isNotNull(jobs.scoreError) : undefined,
    or(isNull(jobs.fitScore), lt(jobs.fitScore, minScore + 100))
  );

  return db.select().from(jobs).where(where).orderBy(desc(jobs.discoveredAt));
}

export async function getJobsForTailor(db: ApplybotDb, maxAttempts: number, minScore: number, onlyFailed = false): Promise<Job[]> {
  return db
    .select()
    .from(jobs)
    .where(
      and(
        isNotNull(jobs.scoredAt),
        isNull(jobs.tailoredAt),
        lt(jobs.tailorAttempts, maxAttempts),
        isNotNull(jobs.fitScore),
        sql`${jobs.fitScore} >= ${minScore}`,
        onlyFailed ? isNotNull(jobs.tailorError) : undefined
      )
    )
    .orderBy(desc(jobs.fitScore));
}

export async function getJobsForCover(db: ApplybotDb, maxAttempts: number, minScore: number, onlyFailed = false): Promise<Job[]> {
  return db
    .select()
    .from(jobs)
    .where(
      and(
        isNotNull(jobs.tailoredAt),
        isNull(jobs.coverLetterAt),
        lt(jobs.coverAttempts, maxAttempts),
        isNotNull(jobs.fitScore),
        sql`${jobs.fitScore} >= ${minScore}`,
        onlyFailed ? isNotNull(jobs.coverError) : undefined
      )
    )
    .orderBy(desc(jobs.fitScore));
}

export async function getJobsForPdf(db: ApplybotDb, maxAttempts: number, onlyFailed = false): Promise<Job[]> {
  return db
    .select()
    .from(jobs)
    .where(
      and(
        isNotNull(jobs.tailoredAt),
        isNotNull(jobs.coverLetterAt),
        isNull(jobs.pdfAt),
        lt(jobs.pdfAttempts, maxAttempts),
        onlyFailed ? isNotNull(jobs.pdfError) : undefined
      )
    )
    .orderBy(desc(jobs.fitScore));
}

export async function getJobsReadyToApply(
  db: ApplybotDb,
  maxAttempts: number,
  maxRows: number,
  onlyUrl?: string,
  includeFailed = false
): Promise<Job[]> {
  const conditions = and(
    isNotNull(jobs.pdfAt),
    or(isNull(jobs.applyStatus), includeFailed ? eq(jobs.applyStatus, 'FAILED') : undefined, eq(jobs.applyStatus, 'NEEDS_REVIEW')),
    lt(jobs.applyAttempts, maxAttempts),
    onlyUrl ? eq(jobs.url, onlyUrl) : undefined
  );

  const rows = await db.select().from(jobs).where(conditions).orderBy(desc(jobs.fitScore), desc(jobs.discoveredAt));
  return rows.slice(0, maxRows);
}

export async function getStatusCounts(db: ApplybotDb) {
  const [totals] = await db.select({ value: count() }).from(jobs);
  const [pendingEnrichment] = await db
    .select({ value: count() })
    .from(jobs)
    .where(and(isNull(jobs.detailScrapedAt), isNull(jobs.detailError)));
  const [scored] = await db.select({ value: count() }).from(jobs).where(isNotNull(jobs.scoredAt));
  const [unscored] = await db.select({ value: count() }).from(jobs).where(isNull(jobs.scoredAt));
  const [tailored] = await db.select({ value: count() }).from(jobs).where(isNotNull(jobs.tailoredAt));
  const [pendingTailor] = await db.select({ value: count() }).from(jobs).where(isNull(jobs.tailoredAt));
  const [coverGenerated] = await db.select({ value: count() }).from(jobs).where(isNotNull(jobs.coverLetterAt));
  const [pendingCover] = await db.select({ value: count() }).from(jobs).where(isNull(jobs.coverLetterAt));
  const [readyToApply] = await db
    .select({ value: count() })
    .from(jobs)
    .where(and(isNotNull(jobs.pdfAt), or(isNull(jobs.applyStatus), eq(jobs.applyStatus, 'NEEDS_REVIEW'), eq(jobs.applyStatus, 'FAILED'))));
  const [applied] = await db.select({ value: count() }).from(jobs).where(eq(jobs.applyStatus, 'APPLIED'));
  const [applyFailures] = await db
    .select({ value: count() })
    .from(jobs)
    .where(or(eq(jobs.applyStatus, 'FAILED'), eq(jobs.applyStatus, 'CAPTCHA'), eq(jobs.applyStatus, 'NEEDS_REVIEW')));

  const perSource = await db
    .select({ source: jobs.source, count: count() })
    .from(jobs)
    .groupBy(jobs.source)
    .orderBy(desc(count()));

  return {
    totals: totals?.value ?? 0,
    pendingEnrichment: pendingEnrichment?.value ?? 0,
    scored: scored?.value ?? 0,
    unscored: unscored?.value ?? 0,
    tailored: tailored?.value ?? 0,
    pendingTailor: pendingTailor?.value ?? 0,
    coverGenerated: coverGenerated?.value ?? 0,
    pendingCover: pendingCover?.value ?? 0,
    readyToApply: readyToApply?.value ?? 0,
    applied: applied?.value ?? 0,
    applyFailures: applyFailures?.value ?? 0,
    perSource
  };
}

export async function getDashboardRows(db: ApplybotDb) {
  return db.select().from(jobs).orderBy(desc(jobs.discoveredAt));
}

export async function markApplied(db: ApplybotDb, url: string) {
  await db
    .update(jobs)
    .set({
      applyStatus: 'APPLIED',
      appliedAt: new Date(),
      applyError: null
    })
    .where(eq(jobs.url, url));
}

export async function markFailed(db: ApplybotDb, url: string, reason: string) {
  await db
    .update(jobs)
    .set({
      applyStatus: 'FAILED',
      applyError: reason,
      lastAttemptedAt: new Date()
    })
    .where(eq(jobs.url, url));
}

export async function resetFailedApplies(db: ApplybotDb) {
  await db
    .update(jobs)
    .set({
      applyStatus: null,
      applyError: null,
      applyAttempts: 0,
      appliedAt: null,
      applyDurationMs: null,
      lastAttemptedAt: null
    })
    .where(eq(jobs.applyStatus, 'FAILED'));
}
