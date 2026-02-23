# Intern Walkthrough: `src/stages/cover/index.ts`

## Why this file matters

This stage generates targeted cover letters and stores canonical artifact paths for later PDF/apply stages.

## Top 20-30% critical code

### Block A: cover generation eligibility

```ts
.where(and(
  isNotNull(jobs.tailoredAt),
  isNull(jobs.coverLetterAt),
  isNotNull(jobs.fitScore),
  sql`${jobs.fitScore} >= ${minScore}`,
  lt(jobs.coverAttempts, maxAttempts),
  ...
));
```

Line-by-line:

- Requires tailored resume to already exist.
- Enforces score gate and attempts cap.
- Optional `retryFailed` filter keeps retries intentional.

### Block B: pull tailored resume context and call LLM

```ts
const tailoredResume = job.tailoredResumePath ? await readFile(job.tailoredResumePath, 'utf8') : '';
const response = await callJsonModel(... coverSchema ...);
```

Line-by-line:

- Reads tailored resume to ground cover letter output.
- Uses strict schema (`coverLetterMarkdown`, `tone`) for predictable parsing.

### Block C: artifact + metadata updates

```ts
await writeFile(mdPath, response.coverLetterMarkdown, 'utf8');
await writeFile(txtPath, `${response.coverLetterMarkdown}\n\nTone: ${response.tone}`, 'utf8');
await ctx.db.update(jobs).set({ coverLetterPath: mdPath, coverLetterAt: new Date(), ... });
```

Line-by-line:

- Writes both markdown and text versions.
- Persists location and success timestamp.
- Error path records attempts + reason and continues.

## What to watch when editing

- Ensure cover stage keeps dependency on tailored stage.
- Maintain stable output filenames by URL hash.
- Never lose `coverError` data on failed generations.
