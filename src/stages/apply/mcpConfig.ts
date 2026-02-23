import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface WorkerConfigPaths {
  workerDir: string;
  claudeMcpPath: string;
  codexDir: string;
  codexConfigPath: string;
}

function renderCodexToml(cdpEndpoint: string, enableGmail: boolean): string {
  const lines = [
    '[mcp_servers.playwright]',
    'command = "npx"',
    `args = ["-y", "@playwright/mcp@latest", "--cdp-endpoint=${cdpEndpoint}"]`,
    ''
  ];

  if (enableGmail) {
    lines.push('[mcp_servers.gmail]');
    lines.push('command = "npx"');
    lines.push('args = ["-y", "@gongrzhe/server-gmail-autoauth-mcp"]');
    lines.push('');
  }

  return lines.join('\n');
}

export async function writeWorkerConfigs(options: {
  workersRoot: string;
  workerId: string;
  cdpEndpoint: string;
  enableGmail: boolean;
}): Promise<WorkerConfigPaths> {
  const workerDir = join(options.workersRoot, options.workerId);
  const codexDir = join(workerDir, '.codex');
  await mkdir(workerDir, { recursive: true });
  await mkdir(codexDir, { recursive: true });

  const claudeMcpPath = join(workerDir, 'claude.mcp.json');
  const codexConfigPath = join(codexDir, 'config.toml');

  const claudeMcpJson = {
    mcpServers: {
      playwright: {
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest', `--cdp-endpoint=${options.cdpEndpoint}`]
      },
      ...(options.enableGmail
        ? {
            gmail: {
              command: 'npx',
              args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp']
            }
          }
        : {})
    }
  };

  await writeFile(claudeMcpPath, JSON.stringify(claudeMcpJson, null, 2), 'utf8');
  await writeFile(codexConfigPath, renderCodexToml(options.cdpEndpoint, options.enableGmail), 'utf8');

  return {
    workerDir,
    claudeMcpPath,
    codexDir,
    codexConfigPath
  };
}
