import { RetryableError, NonRetryableError } from './types.js';

interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = { maxAttempts: 4, baseDelayMs: 300, maxDelayMs: 8000 }
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (err instanceof NonRetryableError) {
        throw err; // don't waste attempts on errors retrying can't fix
      }

      if (attempt === options.maxAttempts) {
        break; // out of attempts, fall through and throw below
      }

      const exponential = Math.min(
        options.baseDelayMs * 2 ** (attempt - 1),
        options.maxDelayMs
      );
      const jitter = Math.random() * exponential * 0.3;
      const delay = exponential + jitter;

      console.warn(
        `Attempt ${attempt} failed (${(err as Error).message}), retrying in ${Math.round(delay)}ms`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Unknown error during retry');
}