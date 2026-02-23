# Intern Walkthrough: `src/stages/discover/index.ts`

## Why this file matters

This file is the pipeline entrypoint. Bad normalization here contaminates every downstream stage.

## Top 20-30% critical code

### Block A: adapter normalization helpers

```ts
function safeString(value: unknown): string | undefined { ... }
function deepGet(record: unknown, path: string): unknown { ... }
```

Line-by-line:

- `safeString` removes empty/non-string fields safely.
- `deepGet` resolves dotted JSON paths from user mappings.
- These two functions power JSON feed adapter flexibility.

### Block B: Workday endpoint discovery and paging

```ts
const candidates = makeWorkdayCandidateUrls(tenant, site, company);
...
if (Array.isArray(json.jobPostings)) { baseUrl = candidate; break; }
...
for (let offset = 0; offset < 2000; offset += pageSize) { ... }
```

Line-by-line:

- Builds likely Workday CXS host variants (`wd1`...`wd5`).
- Probes candidates until one returns expected shape.
- Pages results via `limit/offset` loop.

### Block C: global dedupe and upsert

```ts
const all = [...fromRss, ...fromWorkday, ...fromJson];
const byUrl = new Map<string, NormalizedJob>();
for (const item of all) { byUrl.set(item.url, item); }

await upsertDiscoveredJobs(ctx.db, normalized);
```

Line-by-line:

- Merges all adapter outputs.
- Deduplicates by canonical URL map key.
- Persists deduped jobs through single DB helper.

## What to watch when editing

- Keep adapter failures isolated; never crash entire discover stage.
- Preserve URL canonicalization with `normalizeUrl` before dedupe.
- If adding adapters, keep output in `NormalizedJob` shape.
