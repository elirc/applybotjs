import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { input, confirm } from '@inquirer/prompts';
import type { Command } from 'commander';
import { getApplybotPaths } from '../shared/appPaths.js';
import { configTemplateYaml, envTemplate, profileTemplateJson } from '../config/templates.js';
import { profileSchema } from '../config/schema.js';
import { runMigrations } from '../db/migrate.js';

interface InitOptions {
  nonInteractive?: boolean;
  resumeFile?: string;
}

async function ensureFile(path: string, content: string, overwrite: boolean) {
  if (existsSync(path) && !overwrite) {
    return;
  }
  await writeFile(path, content, 'utf8');
}

export function registerInitCommand(program: Command) {
  program
    .command('init')
    .description('Initialize applybot home, profile, config, and database')
    .option('--non-interactive', 'Use template defaults and skip prompts')
    .option('--resume-file <path>', 'Import resume text from a file')
    .action(async (options: InitOptions) => {
      const paths = getApplybotPaths();
      await mkdir(paths.rootDir, { recursive: true });
      await mkdir(paths.logsDir, { recursive: true });
      await mkdir(paths.tailoredDir, { recursive: true });
      await mkdir(paths.coverDir, { recursive: true });
      await mkdir(paths.pdfDir, { recursive: true });
      await mkdir(paths.dashboardDir, { recursive: true });

      let overwrite = options.nonInteractive ?? false;
      if (!options.nonInteractive && (existsSync(paths.configPath) || existsSync(paths.profilePath))) {
        overwrite = await confirm({
          message: `Files already exist in ${paths.rootDir}. Overwrite config/profile templates?`,
          default: false
        });
      }

      await ensureFile(paths.configPath, configTemplateYaml(), overwrite);
      await ensureFile(paths.envPath, envTemplate(), overwrite);

      let profile = JSON.parse(profileTemplateJson());
      if (!options.nonInteractive) {
        profile.personal.name = await input({ message: 'Full name:' });
        profile.personal.email = await input({ message: 'Email:' });
        profile.personal.phone = await input({ message: 'Phone:' });
        profile.personal.address = await input({ message: 'Address:' });
        profile.personal.linkedin = await input({ message: 'LinkedIn URL (optional):', default: '' });
        profile.personal.github = await input({ message: 'GitHub URL (optional):', default: '' });
        profile.personal.portfolio = await input({ message: 'Portfolio URL (optional):', default: '' });
        profile.experienceSummary = await input({
          message: 'Experience summary (1-3 sentences):'
        });
      } else {
        profile.personal.name = 'Your Name';
        profile.personal.email = 'you@example.com';
        profile.personal.phone = '555-555-5555';
        profile.personal.address = '123 Main St, City, ST 12345';
        profile.experienceSummary = 'Experienced engineer focused on shipping high-quality software.';
      }

      profile = profileSchema.parse(profile);
      await ensureFile(paths.profilePath, JSON.stringify(profile, null, 2), true);

      let resumeText = '# Resume\n\nAdd your resume content.';
      if (options.resumeFile) {
        resumeText = await readFile(options.resumeFile, 'utf8');
      } else if (!options.nonInteractive) {
        const importFromFile = await confirm({
          message: 'Import resume from an existing file?',
          default: false
        });
        if (importFromFile) {
          const resumePath = await input({ message: 'Path to resume text/markdown file:' });
          resumeText = await readFile(resumePath, 'utf8');
        } else {
          resumeText = await input({
            message: 'Paste resume summary (you can edit ~/.applybot/resume.md later):',
            default: resumeText
          });
        }
      }

      await ensureFile(paths.resumePath, resumeText, true);

      await runMigrations();
      console.log(`Initialized applybot at ${paths.rootDir}`);
      console.log(`- Config: ${paths.configPath}`);
      console.log(`- Profile: ${paths.profilePath}`);
      console.log(`- Resume: ${paths.resumePath}`);
      console.log(`- Env: ${paths.envPath}`);
      console.log(`- DB: ${paths.dbPath}`);
    });
}
