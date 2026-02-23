# Architecture

## Module boundaries

- `src/cli/`: Commander entrypoints and command orchestration.
- `src/config/`: zod schemas, YAML/JSON loading, templates.
- `src/db/`: Drizzle schema, migrations, status/query helpers.
- `src/stages/discover/`: RSS, Workday CXS, and mapped JSON feed adapters.
- `src/stages/enrich/`: fetch job pages/APIs, resolve full description/application URL.
- `src/stages/score/`: LLM fit scoring (`score`, `reasoning`) with strict JSON schema validation.
- `src/stages/tailor/`: LLM tailored resume generation with strict JSON schema validation.
- `src/stages/cover/`: LLM cover letter generation with strict JSON schema validation.
- `src/stages/pdf/`: Playwright HTML/PDF conversion for tailored resume + cover letter.
- `src/stages/apply/`: stage 6 orchestration, prompt builder, worker Chrome CDP setup, MCP config generation.
- `src/stages/apply/agents/`: backend abstraction and runners (`claude`, `codex`), output parsing.
- `src/shared/`: runtime wiring, logger, utility helpers, error helpers.

## Data flow

1. **Discover** writes/upserts canonical jobs by URL.
2. **Enrich** fills `fullDescription` and `applicationUrl`.
3. **Score** adds `fitScore` and `scoreReasoning`.
4. **Tailor** generates markdown/text files and stores paths.
5. **Cover** generates markdown/text files and stores paths.
6. **PDF** renders upload-ready PDFs and stores paths.
7. **Apply** runs agent backend(s), parses terminal contract, updates apply metadata.

Each stage tracks:

- attempts (`<stage>Attempts`)
- error (`<stage>Error`)
- success marker (timestamp/path field)

Eligibility: success missing + attempts below configured max.

## Stage 6 abstraction

- `AgentRunner` interface in `agents/base.ts`.
- Shared parser in `agents/parsing.ts` supports:
  - `RESULT: <STATUS> - <reason>`
  - JSON object `{ "result": ..., "reason": ..., "submitted": ... }`
- Claude backend: `claudeRunner.ts`
- Codex backend: `codexRunner.ts` using `codex exec --json`

### Fallback behavior

`--agent auto`:

- Run Claude first.
- Fallback to Codex only on execution/parse-failure conditions.
- Do not fallback for valid terminal outcomes (`FAILED`, `CAPTCHA`, `NEEDS_REVIEW`, etc.).

## Worker + MCP topology

Per worker:

- One Chrome instance started with CDP port.
- Claude MCP JSON generated with Playwright MCP command (and optional Gmail MCP).
- Codex `.codex/config.toml` generated with equivalent MCP server definitions.

## Shutdown semantics

On `SIGINT`/`SIGTERM`:

- stop queue immediately,
- no new jobs dequeued,
- in-progress jobs marked failed/interrupted.

## Dashboard

`applybot dashboard` generates static HTML with:

- summary cards,
- source breakdown,
- searchable/filterable/sortable jobs table.
