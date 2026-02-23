# Intern Walkthrough: `src/stages/apply/index.ts`

## Why this file matters

This is the most operationally critical file. It runs worker queues, starts Chrome CDP, invokes agent backends, and writes final apply status.

## Top 20-30% critical code

### Block A: queue setup + signal handling

```ts
let aborted = false;
const abortController = new AbortController();
const inProgress = new Map<string, string>();
const onSignal = () => {
  aborted = true;
  abortController.abort();
};
process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);
```

Line-by-line:

- `aborted` controls queue stop condition.
- `AbortController` propagates cancellation to running subprocesses.
- `inProgress` tracks rows that need interrupted cleanup.
- Signal handlers implement immediate-stop behavior.

### Block B: multi-worker dequeue loop

```ts
const workerPromises = Array.from({ length: Math.max(1, options.workers) }, async (_, workerIndex) => {
  ...
  while (true) {
    if (aborted || appliedCount >= options.maxApplies) return;
    const current = index; index += 1;
    if (current >= rows.length) return;
    const job = rows[current];
    ...
  }
});
```

Line-by-line:

- Spawns configured number of workers.
- Uses shared `index` cursor for simple in-memory queueing.
- Enforces stop conditions (`aborted`, `maxApplies`, queue exhausted).

### Block C: backend execution + fallback policy

```ts
if (options.agent === 'claude') result = await runClaude();
else if (options.agent === 'codex') result = await runCodex();
else {
  const claude = await runClaude();
  if (claude.exitCode !== 0 && fallbackParseIndicator(claude.parsed)) {
    result = await runCodex();
  } else {
    result = claude;
  }
}
```

Line-by-line:

- Fixed backend modes are direct.
- Auto mode prefers Claude.
- Fallback to Codex only on execution/parse-failure indicators.

### Block D: status normalization and persistence

```ts
const parsed = options.dryRun && result.parsed.status === 'APPLIED'
  ? { ...result.parsed, status: 'DRY_RUN', submitted: false, reason: 'Dry-run mode enforced' }
  : result.parsed;

await ctx.db.update(jobs).set({ applyStatus: status, applyError: ..., appliedAt: ..., agentId: result.engine, ... });
```

Line-by-line:

- Hard-enforces dry-run safety even if agent says APPLIED.
- Writes canonical per-attempt metadata for auditability.
- Keeps `agentId` and task/log linkage for debugging.

### Block E: interrupted cleanup

```ts
if (aborted && inProgress.size > 0) {
  for (const [url] of inProgress.entries()) {
    await ctx.db.update(jobs).set({ applyStatus: 'FAILED', applyError: 'Interrupted by signal', ... })
  }
}
```

Line-by-line:

- Any in-flight job during abort is explicitly marked failed/interrupted.
- Prevents silent dangling `RUNNING` rows.

## What to watch when editing

- Treat this as concurrency-sensitive code.
- Keep allowlist checks before agent execution.
- Ensure every path removes row from `inProgress` in `finally`.
