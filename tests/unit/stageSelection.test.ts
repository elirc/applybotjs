import { describe, expect, it } from 'vitest';
import { resolveStages } from '../../src/cli/stageSelection.js';

describe('resolveStages', () => {
  it('defaults to stages 1-5.5 when empty', () => {
    expect(resolveStages([])).toEqual(['discover', 'enrich', 'score', 'tailor', 'cover', 'pdf']);
  });

  it('supports all keyword', () => {
    expect(resolveStages(['all'])).toEqual(['discover', 'enrich', 'score', 'tailor', 'cover', 'pdf']);
  });

  it('filters invalid stages and deduplicates', () => {
    expect(resolveStages(['discover', 'bad', 'discover', 'score'])).toEqual(['discover', 'score']);
  });
});
