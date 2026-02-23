import { createHash } from 'node:crypto';

export function jobIdFromUrl(url: string): string {
  return createHash('sha1').update(url).digest('hex').slice(0, 16);
}

export function normalizeUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = '';
  const sorted = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  url.search = '';
  for (const [key, value] of sorted) {
    if (key.toLowerCase().startsWith('utm_')) {
      continue;
    }

    url.searchParams.append(key, value);
  }

  return url.toString();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
