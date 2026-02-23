# Intern Walkthrough: `src/cli/apply.ts`

## Why this file matters

This is the command surface for stage 6. It maps CLI flags into `ApplyStageOptions` and supports operational utility actions.

## Top 20-30% critical code

### Block A: utility short-circuit actions

```ts
if (options.markApplied) { ... return; }
if (options.markFailed) { ... return; }
if (options.resetFailed) { ... return; }
```

Line-by-line:

- Each utility command is handled before normal apply execution.
- Uses DB helper functions from `src/db/jobs.ts`.
- Returns immediately to avoid entering worker flow.

### Block B: normalize CLI into typed runtime options

```ts
const resolvedAllowlist = options.domainAllowlist
  ? options.domainAllowlist.split(',').map((item) => item.trim()).filter(Boolean)
  : ctx.config.apply.domainAllowlist;

const applyOptions = {
  agent: options.agent ?? ctx.config.apply.defaultAgent,
  workers: Number(options.workers ?? 1),
  maxApplies: Number(options.maxApplies ?? ctx.config.apply.defaultMaxApplies),
  ...
} as const;
```

Line-by-line:

- Converts comma string allowlist into normalized array.
- Merges CLI overrides with config defaults.
- Casts number-like CLI values into numeric types.
- Produces a single options object passed to stage layer.

### Block C: `--gen` flow vs execute flow

```ts
if (options.gen) {
  const generated = await generatePromptOnly(ctx, applyOptions);
  ...
  return;
}

const result = await runApplyStage(ctx, applyOptions);
```

Line-by-line:

- `--gen` calls prompt-generation path without executing applies.
- Normal path calls full worker runtime.
- Keeps dry-run generation separated from persistent DB mutation flow.

## What to watch when editing

- Keep option names synchronized with help text and stage options type.
- Validate any new numeric flag with `Number(...)` conversion.
- Avoid adding side effects before utility short-circuit checks.
