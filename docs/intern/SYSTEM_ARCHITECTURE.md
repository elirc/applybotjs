# Applybot System Architecture (Intern Guide)

This guide explains how the main modules fit together and where to read first.

## 1) Runtime shape

- `src/cli/*` defines user commands.
- `src/config/schema.ts` validates all user-controlled config/profile input.
- `src/shared/runtime.ts` builds one `RuntimeContext` containing `config`, `profile`, `paths`, `db`, and `logger`.
- `src/db/schema.ts` defines the `jobs` table for the full 6-stage lifecycle.
- `src/db/jobs.ts` contains reusable query/update primitives used by CLI and stages.
- `src/stages/*` contains pipeline stage implementations.

## 2) End-to-end data flow

1. Discover (`src/stages/discover/index.ts`)
   - Collects jobs from RSS, Workday CXS, and mapped JSON feeds.
   - Canonicalizes URL and upserts into `jobs`.
2. Enrich (`src/stages/enrich/index.ts`)
   - Pulls full descriptions/application URLs.
3. Score (`src/stages/score/index.ts`)
   - Calls LLM through shared adapter and writes `fitScore` + reasoning.
4. Tailor (`src/stages/tailor/index.ts`)
   - Generates per-job resume markdown/text files.
5. Cover (`src/stages/cover/index.ts`)
   - Generates per-job cover letter markdown/text files.
6. PDF (`src/stages/pdf/index.ts`)
   - Renders resume/cover markdown to upload-ready PDFs via Playwright.
7. Apply (`src/stages/apply/index.ts`)
   - Multi-worker execution with agent backend (`claude`, `codex`, `auto`).

## 3) Retry model used everywhere

For stages 2-6 each row has:

- attempts counter (e.g. `scoreAttempts`)
- error field (e.g. `scoreError`)
- success marker (e.g. `scoredAt`)

Selection rule: success missing and attempts `< maxAttemptsPerStage`.

This prevents one bad row from crashing the entire run.

## 4) Stage 6 subsystem boundaries

- `src/stages/apply/index.ts`: worker loop, queueing, domain allowlist, DB status updates.
- `src/stages/apply/prompt.ts`: prompt contract and safety instructions.
- `src/stages/apply/mcpConfig.ts`: generates Claude MCP JSON + Codex TOML.
- `src/stages/apply/chrome.ts`: launches/stops Chrome CDP instances.
- `src/stages/apply/agents/*.ts`: backend runners and result parsing.

Important contract: final agent output must include either:

- `RESULT: <STATUS> - <reason>`
- or JSON `{ "result": "...", "reason": "...", "submitted": true|false }`

Parser lives in `src/stages/apply/agents/parsing.ts`.

## 5) Command-to-module map

- `applybot run`: `src/cli/run.ts`
- `applybot apply`: `src/cli/apply.ts`
- `applybot status`: `src/cli/status.ts`
- `applybot doctor`: `src/cli/doctor.ts`
- `applybot dashboard`: `src/cli/dashboard.ts`

## 6) Recommended reading order

1. `src/config/schema.ts`
2. `src/db/schema.ts`
3. `src/db/jobs.ts`
4. `src/cli/run.ts`
5. `src/stages/discover/index.ts`
6. `src/stages/enrich/index.ts`
7. `src/shared/llm.ts`
8. `src/stages/score/index.ts`
9. `src/stages/tailor/index.ts`
10. `src/stages/cover/index.ts`
11. `src/stages/pdf/index.ts`
12. `src/cli/apply.ts`
13. `src/stages/apply/index.ts`
14. `src/stages/apply/agents/parsing.ts`

## 7) Other intern walkthrough files

Each file below has a focused walkthrough for the most critical 20-30% of logic:

- `docs/intern/src_cli_run.md`
- `docs/intern/src_cli_apply.md`
- `docs/intern/src_config_schema.md`
- `docs/intern/src_db_schema.md`
- `docs/intern/src_db_jobs.md`
- `docs/intern/src_shared_llm.md`
- `docs/intern/src_stages_discover_index.md`
- `docs/intern/src_stages_enrich_index.md`
- `docs/intern/src_stages_score_index.md`
- `docs/intern/src_stages_tailor_index.md`
- `docs/intern/src_stages_cover_index.md`
- `docs/intern/src_stages_pdf_index.md`
- `docs/intern/src_stages_apply_index.md`
- `docs/intern/src_stages_apply_agents_parsing.md`
