# Intern Walkthrough: `src/db/schema.ts`

## Why this file matters

This is the canonical lifecycle model for a job. Every stage writes to this same row.

## Top 20-30% critical code

### Block A: primary identity and discovery fields

```ts
url: text('url').primaryKey(),
title: text('title').notNull(),
...
discoveredAt: integer('discovered_at', { mode: 'timestamp_ms' }).notNull(),
```

Line-by-line:

- `url` is the dedupe identity key.
- `title` is required for user visibility and prompts.
- `discoveredAt` enables ordering and freshness checks.

### Block B: per-stage attempt/error/success triads

Examples:

```ts
detailScrapedAt: integer(...),
detailError: text(...),
detailAttempts: integer(...).default(0),

scoredAt: integer(...),
scoreError: text(...),
scoreAttempts: integer(...).default(0),
```

Line-by-line pattern:

- `<stage>At` means success marker.
- `<stage>Error` stores latest human-readable failure.
- `<stage>Attempts` bounds retries.

This pattern is what makes resumable pipelines possible.

### Block C: indexes aligned to runtime query patterns

```ts
index('jobs_fit_score_idx').on(table.fitScore),
index('jobs_apply_status_idx').on(table.applyStatus),
index('jobs_discovered_at_idx').on(table.discoveredAt),
...
```

Line-by-line:

- Score/status/discovery indexes speed CLI status and stage selection.
- Attempt/success indexes speed retry-eligible row queries.

## What to watch when editing

- Schema edits require migration updates.
- Renaming columns can break historical data and stage code.
- Keep naming consistent (`<stage>At`, `<stage>Error`, `<stage>Attempts`).
