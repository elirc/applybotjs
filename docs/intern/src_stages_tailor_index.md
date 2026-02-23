# Intern Walkthrough: `src/stages/tailor/index.ts`

## Why this file matters

This stage creates the per-job resume artifact used by both humans and auto-apply upload flows.

## Top 20-30% critical code

### Block A: eligibility gating by score and attempts

```ts
.where(and(
  isNotNull(jobs.scoredAt),
  isNull(jobs.tailoredAt),
  isNotNull(jobs.fitScore),
  sql`${jobs.fitScore} >= ${minScore}`,
  lt(jobs.tailorAttempts, maxAttempts),
  ...
));
```

Line-by-line:

- Requires scoring completion.
- Excludes already tailored rows.
- Enforces score threshold + max attempts.

### Block B: deterministic output pathing per job

```ts
const id = jobIdFromUrl(job.url);
const mdPath = join(ctx.paths.tailoredDir, `${id}.md`);
const txtPath = join(ctx.paths.tailoredDir, `${id}.txt`);
```

Line-by-line:

- URL-hash ID makes filenames stable and filesystem-safe.
- Keeps markdown and plain-text exports side-by-side.

### Block C: model generation + DB persistence

```ts
const response = await callJsonModel(... tailorSchema ...);
await writeFile(mdPath, response.resumeMarkdown, 'utf8');
await writeFile(txtPath, `${response.resumeMarkdown}\n\nHighlights:\n- ...`, 'utf8');
await ctx.db.update(jobs).set({ tailoredResumePath: mdPath, ... tailoredAt: new Date() ... });
```

Line-by-line:

- Uses strict JSON contract from LLM.
- Writes artifacts before DB success marker.
- Stores both file paths for later pipeline stages.

## What to watch when editing

- Keep output schema stable (`resumeMarkdown`, `highlights`).
- Do not mark `tailoredAt` if file writes fail.
- Preserve truthful-generation instruction in prompt.
