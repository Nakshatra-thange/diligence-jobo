 
export interface ProviderAdapter {
    name: string;
    submitJob(input: Record<string, unknown>): Promise<{ providerJobId: string }>;
    getJobStatus(providerJobId: string): Promise<{
      status: 'processing' | 'succeeded' | 'failed';
      output?: Record<string, unknown>;
    }>;
  }
  
  
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