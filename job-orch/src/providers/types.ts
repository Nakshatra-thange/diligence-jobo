// Every provider adapter implements this shape. This is the seam that
// lets retry/circuit-breaker logic be provider-agnostic.
export interface ProviderAdapter {
    name: string;
    submitJob(input: Record<string, unknown>): Promise<{ providerJobId: string }>;
    getJobStatus(providerJobId: string): Promise<{
      status: 'processing' | 'succeeded' | 'failed';
      output?: Record<string, unknown>;
    }>;
  }
  
  // Errors that are worth retrying (transient) vs not (caller's fault —
  // retrying a 400 for bad input just wastes time and money).
  export class RetryableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'RetryableError';
    }
  }
  
  export class NonRetryableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'NonRetryableError';
    }
  }