import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../providers/index.js', () => ({
  getProvider: vi.fn(),
}));

vi.mock('../db.js', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '../db.js';
import { getProvider } from '../providers/index.js';
import { runReconciliation } from '../reconciliation.js';

describe('reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies a missed terminal event for a job stuck in processing', async () => {
    const stuckJob = {
      id: 'job-1',
      status: 'processing',
      provider: 'replicate',
      provider_job_id: 'prov-1',
    };

    (pool.query as any)
      .mockResolvedValueOnce({ rows: [stuckJob] }) // findStuckJobs
      .mockResolvedValueOnce({ rows: [stuckJob] }) // applyProviderEvent: SELECT FOR UPDATE
      .mockResolvedValueOnce({}) // BEGIN inside applyProviderEvent (transaction client is separate pool.connect in real code — simplified here)
      .mockResolvedValueOnce({}); // UPDATE

    (getProvider as any).mockReturnValue({
      getJobStatus: vi.fn().mockResolvedValue({
        status: 'succeeded',
        output: { url: 'https://example.com/done.png' },
      }),
    });

    const report = await runReconciliation();

    expect(report.checked).toBe(1);
    expect(report.resolved).toBe(1);
    expect(report.orphaned).toBe(0);
  });

  it('flags an orphan when the provider has no record of the job', async () => {
    const orphanJob = {
      id: 'job-2',
      status: 'processing',
      provider: 'replicate',
      provider_job_id: 'prov-missing',
    };

    (pool.query as any).mockResolvedValueOnce({ rows: [orphanJob] });

    (getProvider as any).mockReturnValue({
      getJobStatus: vi.fn().mockRejectedValue(new Error('Unknown provider job id')),
    });

    const report = await runReconciliation();

    expect(report.orphaned).toBe(1);
    expect(report.resolved).toBe(0);
  });

  it('flags jobs stuck in pending as a worker-pickup alert, not a provider issue', async () => {
    const neverPickedUp = {
      id: 'job-3',
      status: 'pending',
      provider: 'replicate',
      provider_job_id: null,
    };

    (pool.query as any).mockResolvedValueOnce({ rows: [neverPickedUp] });

    const report = await runReconciliation();

    expect(report.stillPending).toBe(1);
    expect(getProvider).not.toHaveBeenCalled();
  });
});