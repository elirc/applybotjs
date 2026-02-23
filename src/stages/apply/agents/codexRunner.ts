import { writeFile } from 'node:fs/promises';
import { execa } from 'execa';
import type { AgentRunResult, AgentRunner } from './base.js';
import { parseAgentOutcome } from './parsing.js';

interface CodexRunnerOptions {
  binaryPath?: string;
  model?: string;
  rawLogPath: string;
  eventsPath: string;
  outputSchemaPath?: string;
}

function extractFinalTextFromJsonl(output: string): string {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const textChunks: string[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      if (typeof event.final === 'string') {
        textChunks.push(event.final);
      } else if (typeof event.message === 'string') {
        textChunks.push(event.message);
      } else if (typeof event.output_text === 'string') {
        textChunks.push(event.output_text);
      } else if (event.type === 'final' && typeof event.content === 'string') {
        textChunks.push(event.content);
      }
    } catch {
      // ignore non-json line
    }
  }

  return textChunks.length > 0 ? textChunks.join('\n') : output;
}

export class CodexRunner implements AgentRunner {
  private readonly binaryPath: string;
  private readonly model?: string;
  private readonly rawLogPath: string;
  private readonly eventsPath: string;
  private readonly outputSchemaPath?: string;

  constructor(options: CodexRunnerOptions) {
    this.binaryPath = options.binaryPath ?? 'codex';
    this.model = options.model;
    this.rawLogPath = options.rawLogPath;
    this.eventsPath = options.eventsPath;
    this.outputSchemaPath = options.outputSchemaPath;
  }

  async run(prompt: string, opts: { workdir: string; timeoutSec: number; signal?: AbortSignal }): Promise<AgentRunResult> {
    const args = ['exec', '--json'];
    if (this.model) {
      args.push('--model', this.model);
    }
    if (this.outputSchemaPath) {
      args.push('--output-schema', this.outputSchemaPath);
    }
    args.push(prompt);

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

    const fullOutput = result.all ?? result.stdout ?? result.stderr ?? '';
    const finalText = extractFinalTextFromJsonl(fullOutput);

    await writeFile(this.eventsPath, fullOutput, 'utf8');
    await writeFile(this.rawLogPath, finalText, 'utf8');

    return {
      engine: 'codex',
      exitCode: result.exitCode ?? 0,
      finalText,
      eventsPath: this.eventsPath,
      rawLogPath: this.rawLogPath,
      durationMs,
      parsed: parseAgentOutcome(finalText)
    };
  }
}
