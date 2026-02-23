# Intern Walkthrough: `src/config/schema.ts`

## Why this file matters

This file defines all trusted input boundaries for config/profile. If data gets past this file, downstream code assumes it is valid.

## Top 20-30% critical code

### Block A: `configSchema`

```ts
export const configSchema = z.object({
  pipeline: z.object({ ... }),
  discovery: z.object({ ... }),
  llm: z.object({ ... }),
  apply: z.object({ ... }),
  paths: z.object({ ... }).optional().nullable()
});
```

Line-by-line:

- `pipeline` controls retries, polling, and stage concurrency.
- `discovery` binds adapter sources and required field mappings.
- `llm.provider` restricts provider choices to known implementations.
- `apply` encodes default operational safety settings.
- `paths` optional/nullable handling prevents startup crashes when missing.

### Block B: `profileSchema`

```ts
export const profileSchema = z.object({
  personal: z.object({ ... }),
  workAuthorization: z.object({ ... }),
  compensation: z.object({ ... }),
  experienceSummary: z.string().min(1),
  screeningDefaults: z.object({ ... })
});
```

Line-by-line:

- Strongly typed personal data for form filling.
- Work authorization is explicit to prevent incorrect autofill.
- Compensation supports optional ranges.
- Screening defaults provide deterministic fallback values.

### Block C: `loadConfigAndProfile()`

```ts
if (existsSync(paths.envPath)) {
  loadDotenv({ path: paths.envPath, override: true });
}

const parsedConfig = configSchema.parse(YAML.parse(rawConfig) ?? {});
const profile = profileSchema.parse(JSON.parse(rawProfile));
```

Line-by-line:

- Loads `.env` before provider usage.
- Parses YAML/JSON and validates immediately.
- Throws on invalid config early, not during long pipeline runs.

Then path overrides are applied:

```ts
if (overridePaths?.logsDir) { paths.logsDir = resolve(overridePaths.logsDir); }
...
```

- Allows custom output locations while keeping one canonical `paths` object.

## What to watch when editing

- Any schema change is an API change for users.
- Keep defaults explicit to avoid hidden behavior.
- Prefer additive optional fields over breaking required-field changes.
