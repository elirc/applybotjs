import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execa } from 'execa';
import { chromium } from 'playwright';

const windowsCandidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
];

async function canExecute(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveChromePath(): Promise<string> {
  if (process.env.CHROME_PATH && (await canExecute(process.env.CHROME_PATH))) {
    return process.env.CHROME_PATH;
  }

  if (process.platform === 'win32') {
    for (const candidate of windowsCandidates) {
      if (await canExecute(candidate)) {
        return candidate;
      }
    }
  }

  return chromium.executablePath();
}

async function waitForCdp(port: number, timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://localhost:${port}/json/version`);
      if (response.ok) {
        return;
      }
    } catch {
      // wait and retry
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Chrome CDP endpoint did not become ready on port ${port}`);
}

export interface ChromeInstance {
  port: number;
  process: ReturnType<typeof execa>;
  endpoint: string;
}

export async function startChromeCdp(options: {
  port: number;
  userDataDir: string;
  headless: boolean;
}): Promise<ChromeInstance> {
  const binary = await resolveChromePath();
  const args = [
    `--remote-debugging-port=${options.port}`,
    `--user-data-dir=${options.userDataDir}`,
    '--no-first-run',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-popup-blocking',
    '--disable-sync',
    'about:blank'
  ];

  if (options.headless) {
    args.push('--headless=new');
  }

  const child = execa(binary, args, {
    windowsHide: true,
    all: true,
    reject: false
  });

  await waitForCdp(options.port, 20_000);

  return {
    port: options.port,
    process: child,
    endpoint: `http://localhost:${options.port}`
  };
}

export async function stopChromeCdp(instance: ChromeInstance) {
  if (!instance.process.killed) {
    instance.process.kill('SIGTERM');
  }
}
