export class StageError extends Error {
  readonly stage: string;
  readonly jobUrl?: string;
  readonly attempt?: number;

  constructor(params: { stage: string; message: string; jobUrl?: string; attempt?: number; cause?: unknown }) {
    super(params.message, { cause: params.cause });
    this.name = 'StageError';
    this.stage = params.stage;
    this.jobUrl = params.jobUrl;
    this.attempt = params.attempt;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
