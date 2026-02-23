# Intern Walkthrough: `src/db/jobs.ts`

## Why this file matters

This is the query policy layer. Stages and commands depend on these functions to decide which jobs move forward.

## Top 20-30% critical code

### Block A: discovery upsert logic

```ts
await db.insert(jobs).values(discovered).onConflictDoUpdate({
  target: jobs.url,
  set: {
    title: sql`excluded.title`,
    salary: sql`coalesce(excluded.salary, ${jobs.salary})`,
    ...
  }
});
```

Line-by-line:

- Inserts newly discovered rows.
- On URL conflict, updates selective fields.
- `coalesce(excluded, existing)` preserves existing values when new data is empty.

### Block B: stage eligibility queries

Example (`getJobsReadyToApply`):

```ts
const conditions = and(
  isNotNull(jobs.pdfAt),
  or(isNull(jobs.applyStatus), includeFailed ? eq(jobs.applyStatus, 'FAILED') : undefined, eq(jobs.applyStatus, 'NEEDS_REVIEW')),
  lt(jobs.applyAttempts, maxAttempts),
  onlyUrl ? eq(jobs.url, onlyUrl) : undefined
);
```

Line-by-line:

- Requires PDF stage completion.
- Includes pending/review (and optionally failed) statuses.
- Enforces global max attempts cap.
- Supports targeted URL run.

This same style exists for enrichment, scoring, tailoring, cover, and PDF functions.

### Block C: status aggregation for reporting

```ts
const [totals] = await db.select({ value: count() }).from(jobs);
...
const perSource = await db.select({ source: jobs.source, count: count() }).from(jobs).groupBy(jobs.source);
```

Line-by-line:

- Calculates each status metric independently for clear semantics.
- `perSource` enables source-level health checks.

## What to watch when editing

- Query predicates are business rules; change carefully.
- Keep helper return shapes stable for CLI callers.
- Avoid putting prompt/agent logic in this DB layer.
