export type ParsedOutcomeStatus = 'APPLIED' | 'FAILED' | 'CAPTCHA' | 'NEEDS_REVIEW' | 'DRY_RUN';

export interface ParsedOutcome {
  status: ParsedOutcomeStatus;
  reason: string;
  submitted: boolean;
}

export interface AgentRunResult {
  engine: 'claude' | 'codex';
  exitCode: number;
  finalText: string;
  eventsPath?: string;
  rawLogPath: string;
  durationMs: number;
  parsed: ParsedOutcome;
}

export interface AgentRunner {
  run(prompt: string, opts: { workdir: string; timeoutSec: number; signal?: AbortSignal }): Promise<AgentRunResult>;
}
