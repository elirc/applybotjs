import Parser from 'rss-parser';
import type { RuntimeContext } from '../../shared/runtime.js';
import { normalizeUrl } from '../../shared/utils.js';
import { upsertDiscoveredJobs } from '../../db/jobs.js';
import type { NewJob } from '../../db/schema.js';

interface NormalizedJob {
  url: string;
  title: string;
  description?: string;
  location?: string;
  salary?: string;
  site?: string;
  strategy: string;
  source: string;
  discoveredAt: Date;
}

function safeString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

function deepGet(record: unknown, path: string): unknown {
  const pieces = path.split('.');
  let cursor: unknown = record;
  for (const piece of pieces) {
    if (cursor && typeof cursor === 'object' && piece in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[piece];
    } else {
      return undefined;
    }
  }

  return cursor;
}

async function fetchRssJobs(ctx: RuntimeContext): Promise<NormalizedJob[]> {
  const parser = new Parser();
  const jobs: NormalizedJob[] = [];

  for (const feed of ctx.config.discovery.rssFeeds) {
    try {
      const parsed = await parser.parseURL(feed);
      for (const item of parsed.items) {
        const rawUrl = item.link ?? item.guid;
        if (!rawUrl || !item.title) {
          continue;
        }

        jobs.push({
          url: normalizeUrl(rawUrl),
          title: item.title,
          description: item.contentSnippet ?? item.content,
          site: parsed.title,
          strategy: 'rss',
          source: `rss:${feed}`,
          discoveredAt: item.pubDate ? new Date(item.pubDate) : new Date()
        });
      }
    } catch (error) {
      ctx.logger.warn({ feed, err: error }, 'rss adapter failed for feed');
    }
  }

  return jobs;
}

interface WorkdayPosting {
  externalPath?: string;
  title?: string;
  locationsText?: string;
  bulletFields?: Array<{ label?: string; value?: string }>;
  postedOn?: string;
}

interface WorkdayResponse {
  jobPostings?: WorkdayPosting[];
  total?: number;
}

function makeWorkdayCandidateUrls(tenant: string, site: string, company: string): string[] {
  const hosts = ['wd1', 'wd2', 'wd3', 'wd4', 'wd5'];
  const candidates: string[] = [];
  for (const host of hosts) {
    candidates.push(`https://${tenant}.${host}.myworkdaysite.com/wday/cxs/${tenant}/${site}/jobs`);
    candidates.push(`https://${company}.${host}.myworkdaysite.com/wday/cxs/${tenant}/${site}/jobs`);
  }

  return candidates;
}

async function fetchWorkdayTenantJobs(
  company: string,
  tenant: string,
  site: string,
  logger: RuntimeContext['logger']
): Promise<NormalizedJob[]> {
  const candidates = makeWorkdayCandidateUrls(tenant, site, company);
  const pageSize = 20;
  let baseUrl: string | undefined;

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${candidate}?limit=${pageSize}&offset=0`, {
        headers: {
          'user-agent': 'applybot/0.1.0',
          accept: 'application/json'
        }
      });

      if (!response.ok) {
        continue;
      }

      const json = (await response.json()) as WorkdayResponse;
      if (Array.isArray(json.jobPostings)) {
        baseUrl = candidate;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!baseUrl) {
    throw new Error(`No working Workday endpoint found for tenant=${tenant}, site=${site}`);
  }

  const jobs: NormalizedJob[] = [];
  for (let offset = 0; offset < 2000; offset += pageSize) {
    const response = await fetch(`${baseUrl}?limit=${pageSize}&offset=${offset}`, {
      headers: {
        'user-agent': 'applybot/0.1.0',
        accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Workday request failed (${response.status})`);
    }

    const json = (await response.json()) as WorkdayResponse;
    const postings = json.jobPostings ?? [];
    if (postings.length === 0) {
      break;
    }

    for (const posting of postings) {
      if (!posting.externalPath || !posting.title) {
        continue;
      }

      const salary = posting.bulletFields?.find((field) => field.label?.toLowerCase().includes('salary'))?.value;
      const url = new URL(posting.externalPath, baseUrl).toString();
      jobs.push({
        url: normalizeUrl(url),
        title: posting.title,
        location: posting.locationsText,
        salary,
        strategy: 'workday',
        source: `workday:${company}:${tenant}:${site}`,
        site,
        discoveredAt: posting.postedOn ? new Date(posting.postedOn) : new Date()
      });
    }

    if (postings.length < pageSize) {
      break;
    }
  }

  logger.info({ tenant, site, count: jobs.length }, 'workday adapter collected jobs');
  return jobs;
}

async function fetchWorkdayJobs(ctx: RuntimeContext): Promise<NormalizedJob[]> {
  const jobs: NormalizedJob[] = [];

  for (const tenant of ctx.config.discovery.workdayTenants) {
    try {
      const tenantJobs = await fetchWorkdayTenantJobs(tenant.company, tenant.tenant, tenant.site, ctx.logger);
      jobs.push(...tenantJobs);
    } catch (error) {
      ctx.logger.warn({ tenant, err: error }, 'workday adapter failed for tenant');
    }
  }

  return jobs;
}

async function fetchJsonBoardJobs(ctx: RuntimeContext): Promise<NormalizedJob[]> {
  const jobs: NormalizedJob[] = [];

  for (const feed of ctx.config.discovery.jsonBoardFeeds) {
    try {
      const response = await fetch(feed.url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'applybot/0.1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`JSON feed request failed (${response.status})`);
      }

      const body = (await response.json()) as unknown;
      const records = Array.isArray(body)
        ? body
        : Array.isArray((body as Record<string, unknown>).jobs)
          ? ((body as Record<string, unknown>).jobs as unknown[])
          : [];

      for (const record of records) {
        const urlValue = safeString(deepGet(record, feed.mappings.url));
        const title = safeString(deepGet(record, feed.mappings.title));
        if (!urlValue || !title) {
          continue;
        }

        const description = feed.mappings.description ? safeString(deepGet(record, feed.mappings.description)) : undefined;
        const location = feed.mappings.location ? safeString(deepGet(record, feed.mappings.location)) : undefined;
        const salary = feed.mappings.salary ? safeString(deepGet(record, feed.mappings.salary)) : undefined;
        const dateValue = feed.mappings.date ? safeString(deepGet(record, feed.mappings.date)) : undefined;

        jobs.push({
          url: normalizeUrl(urlValue),
          title,
          description,
          location,
          salary,
          site: feed.name,
          strategy: 'json-feed',
          source: `json:${feed.name}`,
          discoveredAt: dateValue ? new Date(dateValue) : new Date()
        });
      }
    } catch (error) {
      ctx.logger.warn({ feed: feed.name, err: error }, 'json adapter failed for feed');
    }
  }

  return jobs;
}

export async function runDiscoverStage(ctx: RuntimeContext): Promise<{ inserted: number; totalFetched: number }> {
  const fromRss = await fetchRssJobs(ctx);
  const fromWorkday = await fetchWorkdayJobs(ctx);
  const fromJson = await fetchJsonBoardJobs(ctx);

  const all = [...fromRss, ...fromWorkday, ...fromJson];
  const byUrl = new Map<string, NormalizedJob>();
  for (const item of all) {
    byUrl.set(item.url, item);
  }

  const normalized: NewJob[] = [...byUrl.values()].map((job) => ({
    url: job.url,
    title: job.title,
    salary: job.salary,
    description: job.description,
    location: job.location,
    site: job.site,
    strategy: job.strategy,
    source: job.source,
    discoveredAt: job.discoveredAt
  }));

  await upsertDiscoveredJobs(ctx.db, normalized);

  ctx.logger.info({ totalFetched: all.length, deduped: normalized.length }, 'discover stage complete');
  return {
    inserted: normalized.length,
    totalFetched: all.length
  };
}
