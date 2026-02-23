# Intern Walkthrough: `src/stages/score/index.ts`

## Why this file matters

This stage assigns the fit score that gates downstream tailoring/cover/apply work.

## Top 20-30% critical code

### Block A: candidate row selection

```ts
const rows = await ctx.db.select().from(jobs).where(and(
  isNotNull(jobs.detailScrapedAt),
  isNull(jobs.scoredAt),
  lt(jobs.scoreAttempts, maxAttempts),
  options.retryFailed ? isNotNull(jobs.scoreError) : undefined
));
```

Line-by-line:

- Requires enrichment completion.
- Skips already scored rows.
- Enforces attempts cap.
- Optional retry-failed mode narrows to prior failures.

### Block B: strict JSON prompt + schema contract

```ts
const response = await callJsonModel(ctx, {
  system: `You are an expert recruiting analyst... JSON only.`,
  user: `Schema: {"score": number 1-10, "reasoning": string}. ...`
}, scoreSchema, { parseRetries: 2 });
```

Line-by-line:

- Prompt includes explicit schema contract.
- Uses shared LLM adapter with schema validation.
- Parse retries reduce brittle failures from model formatting drift.

### Block C: concurrency with safe per-row failure handling

```ts
await runWithConcurrency(rows, ctx.config.pipeline.scoreConcurrency, async (job) => { ... });
```

Line-by-line:

- Controls throughput/cost via config.
- Each job runs independently.
- Failure in one row does not block other rows.

## What to watch when editing

- Keep `score` strictly 1-10 in schema.
- Never write `scoredAt` on partial/invalid outputs.
- If prompt changes, preserve stable JSON keys.
