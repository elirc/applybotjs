# Intern Walkthrough: `src/shared/llm.ts`

## Why this file matters

This file is the single adapter that all AI stages use. It handles provider routing and strict JSON parsing.

## Top 20-30% critical code

### Block A: provider-specific chat calls

```ts
provider === 'openai' ? await openaiChat(...) :
provider === 'anthropic' ? await anthropicChat(...) :
await ollamaChat(...)
```

Line-by-line:

- One switch path keeps stage code provider-agnostic.
- Each provider function validates required env keys.
- Each provider function throws if text output is empty.

### Block B: resilient JSON extraction

```ts
function extractJson(text: string): unknown {
  try { return JSON.parse(trimmed); }
  catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/i);
    if (fenced) return JSON.parse(fenced[1].trim());
  }
  throw new Error('Model did not return valid JSON');
}
```

Line-by-line:

- First tries strict raw JSON.
- Falls back to fenced JSON code block parsing.
- Fails fast if neither format is valid.

### Block C: schema-validated retry loop

```ts
for (let attempt = 0; attempt <= parseRetries; attempt += 1) {
  try {
    const raw = ...provider call...
    const parsed = extractJson(raw);
    return schema.parse(parsed);
  } catch (error) {
    lastError = error;
    userPrompt = `${messages.user}\n\nPrevious output was invalid JSON...`;
  }
}
```

Line-by-line:

- Retries only around parse/schema failures.
- Tightens follow-up prompt to force exact schema output.
- Returns typed object `T` only when Zod validation succeeds.

## What to watch when editing

- Keep provider functions side-effect free.
- Do not bypass `schema.parse` in callers.
- If you add a provider, preserve the same error semantics.
