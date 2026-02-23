# Intern Walkthrough: `src/stages/apply/agents/parsing.ts`

## Why this file matters

This parser turns unstructured agent terminal output into reliable status enums used to update DB state.

## Top 20-30% critical code

### Block A: status normalization

```ts
const statuses: ParsedOutcomeStatus[] = ['APPLIED', 'FAILED', 'CAPTCHA', 'NEEDS_REVIEW', 'DRY_RUN'];

function normalizeStatus(raw: string): ParsedOutcomeStatus | null {
  const upper = raw.trim().toUpperCase();
  const found = statuses.find((status) => status === upper);
  return found ?? null;
}
```

Line-by-line:

- Defines allowed finite set of statuses.
- Converts user/agent casing to canonical enum values.
- Rejects unknown statuses safely.

### Block B: JSON parse strategy

```ts
const fenceMatches = text.match(/```(?:json)?\s*([\s\S]+?)```/gi);
...
const lineObjects = text.split(/\r?\n/).filter((line) => line.startsWith('{') && line.endsWith('}'));
...
const parsed = outcomeSchema.parse(JSON.parse(candidate));
```

Line-by-line:

- Scans fenced blocks first.
- Also scans raw line-level JSON objects.
- Validates shape with Zod before accepting.

### Block C: RESULT line fallback

```ts
const match = line.match(/^result\s*:\s*([a-z_]+)\s*-\s*(.+)$/i);
...
return { status, reason: match[2].trim(), submitted: status === 'APPLIED' };
```

Line-by-line:

- Case-insensitive parse of required RESULT contract.
- Pulls status + reason from one line.
- Defaults submitted flag from status when JSON not available.

### Block D: final hard fallback

```ts
return {
  status: 'NEEDS_REVIEW',
  reason: 'No RESULT line or valid JSON terminal output found',
  submitted: false
};
```

Line-by-line:

- Guarantees parser always returns a safe value.
- Prevents crashes from malformed agent output.
- Enables downstream fallback behavior in auto mode.

## What to watch when editing

- Keep parser deterministic and side-effect free.
- Do not accept free-form statuses.
- Preserve JSON-first precedence (used intentionally in tests).
