export function configTemplateYaml(): string {
  return `# applybot configuration
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
        date: updated_at

llm:
  provider: openai
  model: gpt-4.1-mini
  temperature: 0.2

apply:
  defaultAgent: auto
  defaultMaxApplies: 25
  defaultMinDelaySeconds: 10
  defaultHeadless: true
  enableGmailByDefault: false
  domainAllowlist:
    - example.com

paths:
  # logsDir: ~/.applybot/logs
  # tailoredDir: ~/.applybot/tailored_resumes
  # coverDir: ~/.applybot/cover_letters
  # pdfDir: ~/.applybot/pdfs
  # dashboardDir: ~/.applybot/dashboard
`;
}

export function envTemplate(): string {
  return `# Applybot environment variables
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
CAPSOLVER_API_KEY=
LOG_LEVEL=info
`;
}

export function profileTemplateJson(): string {
  return JSON.stringify(
    {
      personal: {
        name: '',
        email: '',
        phone: '',
        address: '',
        linkedin: '',
        github: '',
        portfolio: ''
      },
      workAuthorization: {
        country: 'United States',
        authorized: true,
        requiresSponsorship: false
      },
      compensation: {
        currency: 'USD',
        minimumBase: 0,
        preferredBase: 0
      },
      experienceSummary: '',
      screeningDefaults: {
        eeoDisclosureConsent: true,
        veteranStatus: '',
        disabilityStatus: '',
        gender: '',
        race: '',
        workAuthorizationAnswer: '',
        sponsorshipAnswer: ''
      }
    },
    null,
    2
  );
}
