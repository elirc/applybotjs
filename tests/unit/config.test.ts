import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { configSchema, profileSchema } from '../../src/config/schema.js';

describe('config schema', () => {
  it('validates minimal valid config', () => {
    const config = YAML.parse(`
pipeline:
  defaultMinScore: 7
  maxAttemptsPerStage: 3
  pollIntervalSeconds: 60

discovery:
  rssFeeds: []
  workdayTenants: []
  jsonBoardFeeds: []

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
  domainAllowlist: []
`);

    const parsed = configSchema.parse(config);
    expect(parsed.pipeline.maxAttemptsPerStage).toBe(3);
    expect(parsed.apply.defaultAgent).toBe('auto');
  });

  it('rejects invalid provider', () => {
    const config = {
      pipeline: { defaultMinScore: 7, maxAttemptsPerStage: 3, pollIntervalSeconds: 60 },
      discovery: { rssFeeds: [], workdayTenants: [], jsonBoardFeeds: [] },
      llm: { provider: 'bad-provider', model: 'x', temperature: 0.2 },
      apply: {
        defaultAgent: 'auto',
        defaultMaxApplies: 25,
        defaultMinDelaySeconds: 10,
        defaultHeadless: true,
        enableGmailByDefault: false,
        domainAllowlist: []
      }
    };

    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe('profile schema', () => {
  it('validates profile shape', () => {
    const profile = {
      personal: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '555',
        address: '123 St',
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
        minimumBase: 100000,
        preferredBase: 140000
      },
      experienceSummary: 'Engineer',
      screeningDefaults: {
        eeoDisclosureConsent: true,
        veteranStatus: '',
        disabilityStatus: '',
        gender: '',
        race: '',
        workAuthorizationAnswer: '',
        sponsorshipAnswer: ''
      }
    };

    expect(() => profileSchema.parse(profile)).not.toThrow();
  });
});
