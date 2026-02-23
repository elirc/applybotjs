#!/usr/bin/env node
import { Command } from 'commander';
import { registerInitCommand } from './init.js';
import { registerRunCommand } from './run.js';
import { registerApplyCommand } from './apply.js';
import { registerDoctorCommand } from './doctor.js';
import { registerStatusCommand } from './status.js';
import { registerDashboardCommand } from './dashboard.js';

const program = new Command();
program.name('applybot').description('AI-assisted job pipeline and auto-apply agent').version('0.1.0');

registerInitCommand(program);
registerRunCommand(program);
registerApplyCommand(program);
registerDoctorCommand(program);
registerStatusCommand(program);
registerDashboardCommand(program);

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
