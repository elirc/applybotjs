import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import { chromium } from 'playwright';
import type { RuntimeContext } from '../../shared/runtime.js';
import { jobs } from '../../db/schema.js';
import { errorMessage } from '../../shared/errors.js';
import { jobIdFromUrl } from '../../shared/utils.js';

interface PdfOptions {
  retryFailed?: boolean;
}

function markdownToHtml(md: string): string {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const html = escaped
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^\- (.*)$/gm, '<li>$1</li>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Georgia, serif; margin: 48px; line-height: 1.45; color: #111; }
    h1,h2,h3 { margin: 0 0 12px 0; }
    p { margin: 0 0 14px 0; }
    li { margin: 0 0 6px 0; }
  </style>
</head>
<body><p>${html}</p></body>
</html>`;
}

export async function runPdfStage(ctx: RuntimeContext, options: PdfOptions = {}) {
  const maxAttempts = ctx.config.pipeline.maxAttemptsPerStage;
  await mkdir(ctx.paths.pdfDir, { recursive: true });

  const rows = await ctx.db
    .select()
    .from(jobs)
    .where(
      and(
        isNotNull(jobs.tailoredAt),
        isNotNull(jobs.coverLetterAt),
        isNull(jobs.pdfAt),
        lt(jobs.pdfAttempts, maxAttempts),
        options.retryFailed ? isNotNull(jobs.pdfError) : undefined
      )
    );

  if (rows.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  let succeeded = 0;
  let failed = 0;

  try {
    for (const job of rows) {
      const attempt = (job.pdfAttempts ?? 0) + 1;
      const id = jobIdFromUrl(job.url);
      const resumePdfPath = join(ctx.paths.pdfDir, `${id}-resume.pdf`);
      const coverPdfPath = join(ctx.paths.pdfDir, `${id}-cover.pdf`);

      try {
        if (!job.tailoredResumePath || !job.coverLetterPath) {
          throw new Error('Missing tailored resume or cover letter source file');
        }

        const resumeMd = await readFile(job.tailoredResumePath, 'utf8');
        const coverMd = await readFile(job.coverLetterPath, 'utf8');

        const resumePage = await context.newPage();
        await resumePage.setContent(markdownToHtml(resumeMd), { waitUntil: 'domcontentloaded' });
        await resumePage.pdf({ path: resumePdfPath, format: 'A4', printBackground: true });
        await resumePage.close();

        const coverPage = await context.newPage();
        await coverPage.setContent(markdownToHtml(coverMd), { waitUntil: 'domcontentloaded' });
        await coverPage.pdf({ path: coverPdfPath, format: 'A4', printBackground: true });
        await coverPage.close();

        await ctx.db
          .update(jobs)
          .set({
            resumePdfPath,
            coverPdfPath,
            pdfAt: new Date(),
            pdfError: null,
            pdfAttempts: attempt
          })
          .where(eq(jobs.url, job.url));
        succeeded += 1;
      } catch (error) {
        failed += 1;
        await ctx.db
          .update(jobs)
          .set({
            pdfAttempts: attempt,
            pdfError: errorMessage(error)
          })
          .where(eq(jobs.url, job.url));
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return { processed: rows.length, succeeded, failed };
}
