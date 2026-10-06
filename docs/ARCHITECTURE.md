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

`--agent auto` (the exact logic lives in `src/stages/apply/index.ts`, around the
`runClaude()`/`runCodex()` closures):

- Run Claude first.
- Fall back to Codex in exactly two cases:
  1. `runClaude()` **throws** (CLI missing, spawn failure, timeout), or
  2. Claude's `exitCode !== 0` **and** the parse came back as the specific
     "no marker found" `NEEDS_REVIEW` (see `fallbackParseIndicator()`).
- Everything else — including a Claude run that exits non-zero but printed a
  valid `RESULT:` line, or exits 0 with unparseable output — is treated as a
  terminal outcome. `FAILED`, `CAPTCHA`, and a genuine `NEEDS_REVIEW` never
  trigger Codex, so one job never gets two submission attempts.

Note the conjunction in case 2: a zero exit code with garbage output does
**not** fall back. That is deliberate (exit 0 means the agent believes it
finished; re-running risks a duplicate application) but it is also the
subtlest line in the stage — see exercise E3.

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

## Where this port differs from the Python sibling (`elirc/applybot`)

Same six-stage design, same agent abstraction — but the parsers are **not**
drop-in equivalents, and reading the two side by side is a good contracts
exercise. Verified differences in `src/stages/apply/agents/parsing.ts`:

1. **Fenced JSON**: this port extracts ` ```json ... ``` ` blocks before
   scanning bare `{...}` lines. The Python parser only scans bare lines.
2. **The dash is mandatory here**: the RESULT regex is
   `/^result\s*:\s*([a-z_]+)\s*-\s*(.+)$/i`, so `RESULT: APPLIED` without
   `- reason` parses as... nothing, and the whole output falls through to
   `NEEDS_REVIEW`. The Python version accepts a bare status token.
3. **No `EXPIRED`/`LOGIN_ISSUE` mapping**: Python folds those tokens into
   `FAILED` with a reason prefix; here `normalizeStatus()` only accepts the
   five canonical statuses and skips anything else.
4. **Validation style**: zod (`outcomeSchema`) validates the JSON shape
   here; Python does dict-key checks by hand. Same contract, different
   enforcement — compare how each rejects `{"result": 42}`.

If one prompt file is ever shared across both implementations, difference 2
is the one that will bite: an agent trained to emit `RESULT: APPLIED` keeps
working on Python and silently degrades to `NEEDS_REVIEW` here.

## Hands-on exercises

Ordered easy → hard. Unit tests run with `pnpm test` (vitest); the parsing
suite alone is `pnpm vitest run tests/unit/parsing.test.ts`.

### E1 — Prove the mandatory-dash rule (20 min)

Add a test to `tests/unit/parsing.test.ts`: `parseAgentOutcome('RESULT: APPLIED')`
(no dash, no reason). Predict the result before running.
**Check**: the status is `NEEDS_REVIEW`, not `APPLIED` — the regex requires
`- <reason>`. Then decide and argue: should a bare status parse? (The Python
sibling says yes.) If you change the regex, which existing test keeps you
honest?

### E2 — Cover the fence path (30 min)

`parseJsonOutcome()` collects fenced ` ```json ` blocks *and* bare JSON
lines into one candidate list and scans it in reverse. Write a test with a
fenced `FAILED` block followed by a bare-line `APPLIED` object.
**Check**: your test documents which candidate wins (read the collection
order: fences are pushed first, bare lines after, scan is last-to-first).
This ordering is currently enforced by nothing but the implementation.

### E3 — Break the fallback coupling, then fix it (45 min)

`fallbackParseIndicator()` in `src/stages/apply/index.ts` decides fallback
by regex-matching the English reason string
(`/No RESULT line or valid JSON terminal output found/i`). Reword that
message in `parsing.ts` and ask what happens to `--agent auto`.
**Check**: no test fails (that's the finding), yet auto-fallback is now
dead code for the parse-failure case. Fix it properly: export a reason
constant or add a machine-readable marker to `ParsedOutcome`, use it in
both files, and add the test that would have caught the regression.

## What a senior reviewer would push back on

All verified against the current code:

1. **String-typed coupling between modules** — the E3 finding. Two files
   agree on an English sentence; the type system can't see the contract.
   The fix is one exported constant, which is why a reviewer will insist.
2. **`submitted` defaults to `status === 'APPLIED'`** in both parse paths.
   An agent that says `APPLIED` without an explicit `submitted` flag is
   *assumed* to have submitted. Defensible — but it means a hallucinated
   `RESULT: APPLIED - ok` line marks the job applied in the DB with no
   secondary evidence. Ask what verification could cheaply back this up
   (the Python lineage stores `verification_confidence`; this schema does
   not).
3. **Dry-run is enforced after the fact**: in `src/stages/apply/index.ts`,
   an `APPLIED` outcome under `--dry-run` is rewritten to `DRY_RUN`
   post-parse. The real protection is the prompt telling the agent not to
   submit — the rewrite just keeps the DB honest if the agent ignores it.
   A reviewer would want that stated in the help text for `--dry-run`
   (currently "Run without final submission", `src/cli/apply.ts:33`),
   because it is a prompt-level promise, not a code-level guarantee.
4. **The parsing suite is the right investment** — three tests today
   covering case-insensitivity, JSON precedence and the NEEDS_REVIEW
   fallback. E1/E2 close the two real gaps (bare status, fences). After
   that, the next test money goes to `fallbackParseIndicator` (E3), not to
   more parser cases.
