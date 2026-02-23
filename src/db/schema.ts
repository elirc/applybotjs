import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const jobs = sqliteTable(
  'jobs',
  {
    url: text('url').primaryKey(),
    title: text('title').notNull(),
    salary: text('salary'),
    description: text('description'),
    location: text('location'),
    site: text('site'),
    strategy: text('strategy'),
    source: text('source'),
    discoveredAt: integer('discovered_at', { mode: 'timestamp_ms' }).notNull(),

    fullDescription: text('full_description'),
    applicationUrl: text('application_url'),
    detailScrapedAt: integer('detail_scraped_at', { mode: 'timestamp_ms' }),
    detailError: text('detail_error'),
    detailAttempts: integer('detail_attempts').notNull().default(0),

    fitScore: integer('fit_score'),
    scoreReasoning: text('score_reasoning'),
    scoredAt: integer('scored_at', { mode: 'timestamp_ms' }),
    scoreError: text('score_error'),
    scoreAttempts: integer('score_attempts').notNull().default(0),

    tailoredResumePath: text('tailored_resume_path'),
    tailoredResumeTextPath: text('tailored_resume_text_path'),
    tailoredAt: integer('tailored_at', { mode: 'timestamp_ms' }),
    tailorError: text('tailor_error'),
    tailorAttempts: integer('tailor_attempts').notNull().default(0),

    coverLetterPath: text('cover_letter_path'),
    coverLetterTextPath: text('cover_letter_text_path'),
    coverLetterAt: integer('cover_letter_at', { mode: 'timestamp_ms' }),
    coverError: text('cover_error'),
    coverAttempts: integer('cover_attempts').notNull().default(0),

    resumePdfPath: text('resume_pdf_path'),
    coverPdfPath: text('cover_pdf_path'),
    pdfAt: integer('pdf_at', { mode: 'timestamp_ms' }),
    pdfError: text('pdf_error'),
    pdfAttempts: integer('pdf_attempts').notNull().default(0),

    applyStatus: text('apply_status'),
    applyError: text('apply_error'),
    applyAttempts: integer('apply_attempts').notNull().default(0),
    appliedAt: integer('applied_at', { mode: 'timestamp_ms' }),
    agentId: text('agent_id'),
    lastAttemptedAt: integer('last_attempted_at', { mode: 'timestamp_ms' }),
    applyDurationMs: integer('apply_duration_ms'),
    applyTaskId: text('apply_task_id')
  },
  (table) => [
    index('jobs_fit_score_idx').on(table.fitScore),
    index('jobs_apply_status_idx').on(table.applyStatus),
    index('jobs_discovered_at_idx').on(table.discoveredAt),
    index('jobs_detail_attempts_idx').on(table.detailAttempts),
    index('jobs_score_attempts_idx').on(table.scoreAttempts),
    index('jobs_tailor_attempts_idx').on(table.tailorAttempts),
    index('jobs_cover_attempts_idx').on(table.coverAttempts),
    index('jobs_pdf_attempts_idx').on(table.pdfAttempts),
    index('jobs_apply_attempts_idx').on(table.applyAttempts),
    index('jobs_detail_scraped_idx').on(table.detailScrapedAt),
    index('jobs_scored_idx').on(table.scoredAt),
    index('jobs_tailored_idx').on(table.tailoredAt),
    index('jobs_cover_idx').on(table.coverLetterAt),
    index('jobs_pdf_idx').on(table.pdfAt)
  ]
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
