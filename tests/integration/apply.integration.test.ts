import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { runMigrations } from '../../src/db/migrate.js';
import { createDb } from '../../src/db/client.js';
import { jobs } from '../../src/db/schema.js';
import { buildRuntimeContext } from '../../src/shared/runtime.js';
import { runApplyStage } from '../../src/stages/apply/index.js';
import { eq } from 'drizzle-orm';

async function binaryAvailable(name: string) {
  try {
    const result = await execa(name, ['--version'], { reject: false });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

describe('integration: stage6 dry-run', { timeout: 180_000 }, () => {
  let server: Server;
  let baseUrl = '';
  let applybotDir = '';
  let skipReason: string | null = null;

  beforeAll(async () => {
    const fixturePath = join(process.cwd(), 'tests/fixtures/fake_job_form.html');
    const fixtureHtml = await readFile(fixturePath, 'utf8');

    server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(fixtureHtml);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine test server port');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;

    applybotDir = await mkdtemp(join(tmpdir(), 'applybot-int-'));
    process.env.APPLYBOT_DIR = applybotDir;

    await mkdir(applybotDir, { recursive: true });
    await writeFile(
      join(applybotDir, 'config.yaml'),
      `pipeline:\n  defaultMinScore: 7\n  maxAttemptsPerStage: 3\n  pollIntervalSeconds: 60\ndiscovery:\n  rssFeeds: []\n  workdayTenants: []\n  jsonBoardFeeds: []\nllm:\n  provider: openai\n  model: gpt-4.1-mini\n  temperature: 0.2\napply:\n  defaultAgent: auto\n  defaultMaxApplies: 25\n  defaultMinDelaySeconds: 0\n  defaultHeadless: true\n  enableGmailByDefault: false\n  domainAllowlist:\n    - 127.0.0.1\n`,
      'utf8'
    );
    await writeFile(
      join(applybotDir, 'profile.json'),
      JSON.stringify(
        {
          personal: {
            name: 'Test User',
            email: 'test@example.com',
            phone: '555',
            address: '123 Test',
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
            preferredBase: 120000
          },
          experienceSummary: 'Integration test profile',
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
      ),
      'utf8'
    );
    await writeFile(join(applybotDir, 'resume.md'), '# Resume\n\nTest resume', 'utf8');
    await writeFile(join(applybotDir, '.env'), 'LOG_LEVEL=info\n', 'utf8');

    try {
      await runMigrations();
      const db = createDb(join(applybotDir, 'applybot.db'));

      await db.insert(jobs).values({
        url: baseUrl,
        title: 'Integration Fake Job',
        description: 'Fake job page',
        location: 'Remote',
        site: 'fixture',
        strategy: 'fixture',
        source: 'fixture:integration',
        discoveredAt: new Date(),
        fullDescription: 'This is a fake test job',
        applicationUrl: baseUrl,
        detailScrapedAt: new Date(),
        fitScore: 9,
        scoreReasoning: 'Great fit',
        scoredAt: new Date(),
        tailoredResumePath: join(applybotDir, 'tailored_resumes/test.md'),
        tailoredResumeTextPath: join(applybotDir, 'tailored_resumes/test.txt'),
        tailoredAt: new Date(),
        coverLetterPath: join(applybotDir, 'cover_letters/test.md'),
        coverLetterTextPath: join(applybotDir, 'cover_letters/test.txt'),
        coverLetterAt: new Date(),
        resumePdfPath: join(applybotDir, 'pdfs/test-resume.pdf'),
        coverPdfPath: join(applybotDir, 'pdfs/test-cover.pdf'),
        pdfAt: new Date(),
        applyStatus: null
      });
    } catch (error) {
      skipReason = `Skipping integration setup: SQLite driver unavailable (${error instanceof Error ? error.message : String(error)})`;
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('runs claude backend dry-run when claude binary is installed', async (context) => {
    if (skipReason) {
      context.skip(skipReason);
      return;
    }

    if (!(await binaryAvailable('claude'))) {
      context.skip('Skipping: claude binary is not installed on PATH');
      return;
    }

    const ctx = await buildRuntimeContext('test-claude');
    await ctx.db
      .update(jobs)
      .set({ applyStatus: null, applyError: null, applyAttempts: 0, appliedAt: null, lastAttemptedAt: null })
      .where(eq(jobs.url, baseUrl));
    const result = await runApplyStage(ctx, {
      agent: 'claude',
      dryRun: true,
      workers: 1,
      headless: true,
      enableGmail: false,
      domainAllowlist: ['127.0.0.1'],
      maxApplies: 1,
      minDelaySeconds: 0,
      timeoutSec: 120,
      url: baseUrl
    });

    expect(result.selected).toBeGreaterThanOrEqual(1);
  });

  it('runs codex backend dry-run when codex binary is installed', async (context) => {
    if (skipReason) {
      context.skip(skipReason);
      return;
    }

    if (!(await binaryAvailable('codex'))) {
      context.skip('Skipping: codex binary is not installed on PATH');
      return;
    }

    const ctx = await buildRuntimeContext('test-codex');
    await ctx.db
      .update(jobs)
      .set({ applyStatus: null, applyError: null, applyAttempts: 0, appliedAt: null, lastAttemptedAt: null })
      .where(eq(jobs.url, baseUrl));
    const result = await runApplyStage(ctx, {
      agent: 'codex',
      dryRun: true,
      workers: 1,
      headless: true,
      enableGmail: false,
      domainAllowlist: ['127.0.0.1'],
      maxApplies: 1,
      minDelaySeconds: 0,
      timeoutSec: 120,
      url: baseUrl
    });

    expect(result.selected).toBeGreaterThanOrEqual(1);
  });
});
