# Config Reference

## `~/.applybot/config.yaml`

```yaml
pipeline:
  defaultMinScore: 7
  maxAttemptsPerStage: 3
  pollIntervalSeconds: 60
  scoreConcurrency: 3
  tailorConcurrency: 2
  coverConcurrency: 2

discovery:
  rssFeeds:
    - https://example.com/jobs.rss

  workdayTenants:
    - company: ExampleCo
      tenant: exampleco
      site: Careers

  jsonBoardFeeds:
    - name: GreenhouseFeed
      url: https://boards-api.greenhouse.io/v1/boards/example/jobs
      mappings:
        title: title
        url: absolute_url
        location: location.name
        description: content
        salary: salary
        date: updated_at

llm:
  provider: openai # openai | anthropic | ollama
  model: gpt-4.1-mini
  temperature: 0.2

apply:
  defaultAgent: auto # claude | codex | auto
  defaultMaxApplies: 25
  defaultMinDelaySeconds: 10
  defaultHeadless: true
  enableGmailByDefault: false
  domainAllowlist:
    - example.com

paths:
  # optional absolute/relative overrides
  # logsDir: ~/.applybot/logs
  # tailoredDir: ~/.applybot/tailored_resumes
  # coverDir: ~/.applybot/cover_letters
  # pdfDir: ~/.applybot/pdfs
  # dashboardDir: ~/.applybot/dashboard
```

## `~/.applybot/profile.json`

```json
{
  "personal": {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "+1-555-555-5555",
    "address": "San Francisco, CA",
    "linkedin": "https://linkedin.com/in/janedoe",
    "github": "https://github.com/janedoe",
    "portfolio": "https://janedoe.dev"
  },
  "workAuthorization": {
    "country": "United States",
    "authorized": true,
    "requiresSponsorship": false
  },
  "compensation": {
    "currency": "USD",
    "minimumBase": 150000,
    "preferredBase": 180000
  },
  "experienceSummary": "Staff-level full-stack engineer with distributed systems and product delivery experience.",
  "screeningDefaults": {
    "eeoDisclosureConsent": true,
    "veteranStatus": "Prefer not to say",
    "disabilityStatus": "Prefer not to say",
    "gender": "Prefer not to say",
    "race": "Prefer not to say",
    "workAuthorizationAnswer": "Yes",
    "sponsorshipAnswer": "No"
  }
}
```

## `~/.applybot/.env`

```bash
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
CAPSOLVER_API_KEY=
LOG_LEVEL=info
```

## Notes

- App home defaults to `~/.applybot`; override with `APPLYBOT_DIR`.
- DB path defaults to `~/.applybot/applybot.db`.
- Stage retries are controlled by `pipeline.maxAttemptsPerStage`.
- Domain allowlist is enforced at apply runtime and in agent prompt contract.
