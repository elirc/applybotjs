import type { Command } from 'commander';
import { buildRuntimeContext } from '../shared/runtime.js';
import { getStatusCounts } from '../db/jobs.js';

export function registerStatusCommand(program: Command) {
  program
    .command('status')
    .description('Show pipeline stage counts and source breakdown')
    .action(async () => {
      const ctx = await buildRuntimeContext('status');
      const counts = await getStatusCounts(ctx.db);

      const rows = [
        { metric: 'total discovered', value: counts.totals },
        { metric: 'pending enrichment', value: counts.pendingEnrichment },
        { metric: 'scored', value: counts.scored },
        { metric: 'unscored', value: counts.unscored },
        { metric: 'tailored', value: counts.tailored },
        { metric: 'pending tailor', value: counts.pendingTailor },
        { metric: 'cover generated', value: counts.coverGenerated },
        { metric: 'pending cover', value: counts.pendingCover },
        { metric: 'ready to apply', value: counts.readyToApply },
        { metric: 'applied', value: counts.applied },
        { metric: 'apply failures', value: counts.applyFailures }
      ];

      console.table(rows);
      console.log('Per-source breakdown:');
      console.table(counts.perSource.map((row) => ({ source: row.source ?? 'unknown', count: row.count })));
    });
}
