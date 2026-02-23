export const orderedStages = ['discover', 'enrich', 'score', 'tailor', 'cover', 'pdf', 'apply'] as const;
export type StageName = (typeof orderedStages)[number];

export function resolveStages(input: string[]): StageName[] {
  if (input.length === 0) {
    return ['discover', 'enrich', 'score', 'tailor', 'cover', 'pdf'];
  }

  const normalized = input.map((item) => item.toLowerCase());
  if (normalized.includes('all')) {
    return ['discover', 'enrich', 'score', 'tailor', 'cover', 'pdf'];
  }

  const selected = normalized.filter((item): item is StageName => orderedStages.includes(item as StageName));
  return [...new Set(selected)];
}
