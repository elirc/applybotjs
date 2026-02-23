# Intern Walkthrough: `src/stages/pdf/index.ts`

## Why this file matters

This stage converts markdown artifacts into upload-ready PDFs used by stage 6.

## Top 20-30% critical code

### Block A: markdown-to-html conversion function

```ts
function markdownToHtml(md: string): string {
  const escaped = md.replace(...);
  const html = escaped.replace(... markdown-ish patterns ...);
  return `<!doctype html>...${html}...`;
}
```

Line-by-line:

- Escapes raw HTML first to prevent injection issues.
- Applies simple markdown-like transformations.
- Wraps content with print-friendly CSS template.

### Block B: browser lifecycle management

```ts
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
...
finally {
  await context.close();
  await browser.close();
}
```

Line-by-line:

- One browser/context reused for all rows in this stage run.
- `finally` guarantees cleanup even when row processing fails.

### Block C: per-job PDF render + DB update

```ts
const resumePage = await context.newPage();
await resumePage.setContent(markdownToHtml(resumeMd), { waitUntil: 'domcontentloaded' });
await resumePage.pdf({ path: resumePdfPath, format: 'A4', printBackground: true });
...
await ctx.db.update(jobs).set({ resumePdfPath, coverPdfPath, pdfAt: new Date(), ... });
```

Line-by-line:

- Renders each document separately for clean output files.
- Stores resulting PDF paths and success metadata.
- Failure path records `pdfError` and increments attempts.

## What to watch when editing

- Keep PDF generation deterministic (same input -> same style/layout).
- Do not mark `pdfAt` before both PDFs succeed.
- If markdown renderer is upgraded, retest generated form-upload readability.
