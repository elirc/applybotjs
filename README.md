# applybot

Production-grade TypeScript/Node.js CLI that runs a 6-stage job pipeline:

1. Discover jobs
2. Enrich details
3. AI score fit
4. Tailor resume
5. Generate cover letter
5.5. Render PDFs
6. Auto-apply via Claude Code CLI or Codex CLI (with auto fallback)

## Stack

- Node.js 20+
- TypeScript
- pnpm
- Commander CLI
- SQLite + Drizzle ORM + Drizzle Kit migrations
- Playwright (PDF + browser automation infra)
- execa (subprocesses)
- zod (validation)
- pino (logging)
- Vitest (+ integration suite)

## Install

```bash
corepack enable
corepack pnpm install
corepack pnpm build
```

If `better-sqlite3` native bindings are blocked by pnpm script approval, run:

```bash
corepack pnpm rebuild better-sqlite3
```

## Initialize

```bash
applybot init
```

Non-interactive setup:

```bash
applybot init --non-interactive
```

This creates under `~/.applybot` (or `APPLYBOT_DIR`):

- `config.yaml`
- `profile.json`
- `resume.md`
- `.env`
- `applybot.db`
- output/log folders

## Pipeline run

Run default stages (discover->pdf):

```bash
applybot run
```

Run selected stages:

```bash
applybot run discover enrich score
```

Retry failed stage rows:

```bash
applybot run enrich score tailor --retry-failed
```

## Stage 6 apply

Claude dry-run:

```bash
applybot apply --agent claude --dry-run
```

Codex dry-run:

```bash
applybot apply --agent codex --dry-run
```

Auto fallback (Claude first, Codex fallback):

```bash
applybot apply --agent auto --dry-run
```

Single URL:

```bash
applybot apply --agent auto --url https://example.com/job/123 --dry-run
```

Enable Gmail MCP:

```bash
applybot apply --enable-gmail
```

Generate prompt/manual command without mutating apply status:

```bash
applybot apply --gen --url https://example.com/job/123 --agent codex --dry-run
```

Utility flags:

```bash
applybot apply --mark-applied <url>
applybot apply --mark-failed <url> --fail-reason "manual failure"
applybot apply --reset-failed
```

## Monitoring

Status table:

```bash
applybot status
```

Environment diagnostics:

```bash
applybot doctor
```

Dashboard HTML (`~/.applybot/dashboard/index.html`):

```bash
applybot dashboard
```

Dashboard supports client-side search, filtering, and sorting.

## Safety controls

- Domain allowlist enforced in prompt and code path.
- Dry-run hard-enforced (`APPLIED` is converted to `DRY_RUN`).
- Min-delay guidance injected into prompt.
- Max applies per run enforced.
- Ctrl+C immediate stop: in-progress jobs are marked `FAILED` with interruption reason.

## Tests

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:integration
```

Integration tests skip with explicit reasons when prerequisites are unavailable:

- SQLite native binding unavailable
- `claude` binary missing
- `codex` binary missing

## Troubleshooting

- `applybot doctor` for binary/config validation.
- If Codex MCP trust warnings appear, run `codex trust .` in project/worker context.
- Ensure Chrome is installed or set `CHROME_PATH`.
- Ensure `.env` contains needed API keys for stages 3-5.
