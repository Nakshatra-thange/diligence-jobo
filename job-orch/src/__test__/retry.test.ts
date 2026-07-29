import { describe, expect, it, vi } from 'vitest';
import { withRetry } from '../providers/retry.js';
import { NonRetryableError, RetryableError } from '../providers/types.js';

describe('withRetry', () => {
  it('retries transient provider failures and returns the eventual result', async () => {
    const submit = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new RetryableError('timeout'))
      .mockRejectedValueOnce(new RetryableError('429 rate limited'))
      .mockResolvedValue('provider-job-123');

    await expect(
      withRetry(submit, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 })
    ).resolves.toBe('provider-job-123');
    expect(submit).toHaveBeenCalledTimes(3);
  });

  it('does not retry malformed provider responses', async () => {
    const submit = vi.fn<() => Promise<void>>().mockRejectedValue(
      new NonRetryableError('malformed response')
    );

    await expect(withRetry(submit)).rejects.toThrow('malformed response');
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
