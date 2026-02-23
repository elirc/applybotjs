import { writeFile } from 'node:fs/promises';
import { execa } from 'execa';
import type { AgentRunResult, AgentRunner } from './base.js';
import { parseAgentOutcome } from './parsing.js';

interface ClaudeRunnerOptions {
  binaryPath?: string;
  model?: string;
  mcpConfigPath: string;
  rawLogPath: string;
}

export class ClaudeRunner implements AgentRunner {
  private readonly binaryPath: string;
  private readonly model?: string;
  private readonly mcpConfigPath: string;
  private readonly rawLogPath: string;

  constructor(options: ClaudeRunnerOptions) {
    this.binaryPath = options.binaryPath ?? 'claude';
    this.model = options.model;
    this.mcpConfigPath = options.mcpConfigPath;
    this.rawLogPath = options.rawLogPath;
  }

  async run(prompt: string, opts: { workdir: string; timeoutSec: number; signal?: AbortSignal }): Promise<AgentRunResult> {
    const args = ['-p', prompt, '--mcp-config', this.mcpConfigPath];
    if (this.model) {
      args.push('--model', this.model);
    }

    const started = Date.now();
    const result = await execa(this.binaryPath, args, {
      cwd: opts.workdir,
      timeout: opts.timeoutSec * 1000,
      reject: false,
      all: true,
      signal: opts.signal,
      env: {
        CI: '1'
      }
    });
    const durationMs = Date.now() - started;

    const finalText = result.all ?? result.stdout ?? result.stderr ?? '';
    await writeFile(this.rawLogPath, finalText, 'utf8');

    return {
      engine: 'claude',
      exitCode: result.exitCode ?? 0,
      finalText,
      rawLogPath: this.rawLogPath,
      durationMs,
      parsed: parseAgentOutcome(finalText)
    };
  }
}
