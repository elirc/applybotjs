# Intern Walkthrough: `src/stages/enrich/index.ts`

## Why this file matters

This stage upgrades shallow discovery records into detailed job data used for scoring and generation.

## Top 20-30% critical code

### Block A: content extraction strategy

```ts
const response = await fetch(job.url, { redirect: 'follow', headers: { 'user-agent': 'applybot/0.1.0' } });
...
if (contentType.includes('application/json')) { ... }
else { ... html parsing ... }
```

Line-by-line:

- Fetches with redirect-follow to capture final application URL.
- Branches extraction by content type.
- Supports both JSON APIs and HTML job pages.

### Block B: HTML cleanup and application URL detection

```ts
const root = stripHtml(html);
const applicationUrlMatch = html.match(/href=["']([^"']*(apply|application|job|careers)[^"']*)["']/i);
const applicationUrl = applicationUrlMatch ? new URL(...).toString() : finalUrl;
```

Line-by-line:

- `stripHtml` removes script/style/tags and compresses whitespace.
- Regex heuristically finds apply-like links.
- Falls back to final fetched URL when no match exists.

### Block C: retry-aware DB update loop

```ts
const selected = await ctx.db.select().from(jobs).where(and(isNull(jobs.detailScrapedAt), lt(jobs.detailAttempts, maxAttempts), ...));
...
await ctx.db.update(jobs).set({ detailScrapedAt: new Date(), detailAttempts: attempt, ... })
...
await ctx.db.update(jobs).set({ detailAttempts: attempt, detailError: errorMessage(error) })
```

Line-by-line:

- Selects only retry-eligible and not-yet-successful rows.
- Increments attempts on both success and failure.
- Stores explicit error message for future retry/inspection.

## What to watch when editing

- Never skip attempt increment on failure.
- Keep extraction logic tolerant; job pages vary heavily.
- Avoid overfitting regex to one board vendor.
