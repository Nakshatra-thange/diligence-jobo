import { describe, expect, it, vi } from 'vitest';
import { reconcilePendingJobs } from '../reconciliation.js';
import type { ProviderAdapter } from '../providers/types.js';

describe('reconcilePendingJobs', () => {
  it('recovers a completed provider job when its webhook never arrived', async () => {
    const getJobStatus = vi.fn<ProviderAdapter['getJobStatus']>().mockResolvedValue({
      status: 'succeeded',
      output: { url: 'https://example.test/result.png' },
    });
    const applyProviderEvent = vi.fn().mockResolvedValue(undefined);

    const result = await reconcilePendingJobs({
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 'job-1', provider: 'replicate', provider_job_id: 'provider-1' }],
      }),
      getProvider: vi.fn().mockReturnValue({ name: 'replicate', submitJob: vi.fn(), getJobStatus }),
      applyProviderEvent,
    });

    expect(result).toEqual({ scanned: 1, reconciled: 1, errors: 0 });
    expect(applyProviderEvent).toHaveBeenCalledWith({
      provider: 'replicate',
      providerJobId: 'provider-1',
      status: 'succeeded',
      output: { url: 'https://example.test/result.png' },
    });
  });

  it('keeps sweeping when a provider lookup fails', async () => {
    const result = await reconcilePendingJobs({
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 'job-2', provider: 'replicate', provider_job_id: 'provider-2' }],
      }),
      getProvider: vi.fn().mockImplementation(() => {
        throw new Error('provider timeout');
      }),
      applyProviderEvent: vi.fn(),
    });

    expect(result).toEqual({ scanned: 1, reconciled: 0, errors: 1 });
  });
});
