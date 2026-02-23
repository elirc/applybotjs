# Intern Walkthrough: `src/cli/run.ts`

## Why this file matters

This is the main stage orchestrator for `applybot run`. It decides which stages execute and in what order.

## Top 20-30% critical code: stage execution loop

### Block A: resolve stage selection and runtime context

```ts
const selected = resolveStages(stages);
if (selected.length === 0) {
  throw new Error('No valid stages selected');
}

const ctx = await buildRuntimeContext('run');
const minScore = Number(options.minScore ?? ctx.config.pipeline.defaultMinScore);
```

Line-by-line:

- `resolveStages(stages)` converts CLI text into a validated stage list.
- Guard clause throws early if input has no valid stages.
- `buildRuntimeContext('run')` loads config/profile + opens DB + logger.
- `minScore` normalizes CLI input and falls back to config default.

### Block B: deterministic per-stage dispatch

```ts
for (const stage of selected) {
  if (stage === 'discover') { ... }
  if (stage === 'enrich') { ... }
  if (stage === 'score') { ... }
  if (stage === 'tailor') { ... }
  if (stage === 'cover') { ... }
  if (stage === 'pdf') { ... }
  if (stage === 'apply') { ... }
}
```

Line-by-line:

- Loop preserves stage order chosen by CLI.
- Each branch calls exactly one stage entrypoint.
- Each result is logged in a concise summary format.
- `continue` in each branch prevents accidental fall-through.

### Block C: apply defaults inside `run`

```ts
const result = await runApplyStage(ctx, {
  agent: ctx.config.apply.defaultAgent,
  dryRun: true,
  workers: 1,
  ...
});
```

Line-by-line:

- `run` uses conservative defaults for stage 6.
- Dry run is enforced here to avoid accidental real submissions from generic runs.
- Explicit options prevent hidden behavior changes in apply stage.

## What to watch when editing

- Keep per-stage summary output stable because users rely on it in scripts.
- If adding a new stage, update both `resolveStages` and this dispatch loop.
- Avoid mutating `ctx.config` in this file; treat config as read-only runtime input.
