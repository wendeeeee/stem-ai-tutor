export class HarnessError extends Error {
  constructor(
    readonly code: string,
    readonly safeMessage: string,
    readonly stage: string,
    readonly retryable = false,
  ) {
    super(safeMessage);
    this.name = 'HarnessError';
  }
}

export function asHarnessError(error: unknown, stage: string): HarnessError {
  if (error instanceof HarnessError) return error;
  return new HarnessError(
    'INTERNAL_ERROR',
    'The tutor could not safely complete this request.',
    stage,
    false,
  );
}
