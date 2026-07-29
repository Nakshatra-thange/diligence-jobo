import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../providers/retry.js';
import { RetryableError, NonRetryableError } from '../providers/types.js';

describe('withRetry', () => {
  it('retries a RetryableError and eventually succeeds', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 3) throw new RetryableError('transient');
      return 'ok';
    });

    const result = await withRetry(fn, { maxAttempts: 4, baseDelayMs: 1, maxDelayMs: 5 });

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('does not retry a NonRetryableError', async () => {
    const fn = vi.fn(async () => {
      throw new NonRetryableError('bad input');
    });

    await expect(
      withRetry(fn, { maxAttempts: 4, baseDelayMs: 1, maxDelayMs: 5 })
    ).rejects.toThrow('bad input');

    expect(fn).toHaveBeenCalledTimes(1); // no retries wasted on a caller error
  });

  it('gives up after maxAttempts on persistent transient failures', async () => {
    const fn = vi.fn(async () => {
      throw new RetryableError('still down');
    });

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 })
    ).rejects.toThrow('still down');

    expect(fn).toHaveBeenCalledTimes(3);
  });
});