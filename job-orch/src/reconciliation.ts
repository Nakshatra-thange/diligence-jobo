import { pool } from './db.js';
import { pathToFileURL } from 'node:url';
import { getProvider } from './providers/index.js';
import { withRetry } from './providers/retry.js';
import { applyProviderEvent } from './webhooks/applyEvent.js';

type PendingProviderJob = {
  id: string;
  provider: string;
  provider_job_id: string;
};

type ReconciliationDependencies = {
  query: (sql: string) => Promise<{ rows: PendingProviderJob[] }>;
  getProvider: typeof getProvider;
  applyProviderEvent: typeof applyProviderEvent;
};

export type ReconciliationResult = {
  scanned: number;
  reconciled: number;
  errors: number;
};

/**
 * Detect terminal provider jobs for which no webhook was received. The
 * operation is deliberately idempotent: applying the same terminal status a
 * second time is harmless because applyProviderEvent locks and ignores jobs
 * that are already terminal.
 */
export async function reconcilePendingJobs(
  dependencies: ReconciliationDependencies = {
    query: (sql) => pool.query(sql),
    getProvider,
    applyProviderEvent,
  }
): Promise<ReconciliationResult> {
  const result = await dependencies.query(
    `SELECT id, provider, provider_job_id
     FROM jobs
     WHERE status = 'processing' AND provider_job_id IS NOT NULL
     ORDER BY updated_at ASC`
  );

  let reconciled = 0;
  let errors = 0;

  for (const job of result.rows) {
    try {
      const provider = dependencies.getProvider(job.provider);
      const providerStatus = await withRetry(() => provider.getJobStatus(job.provider_job_id));

      if (providerStatus.status === 'processing') continue;

      await dependencies.applyProviderEvent({
        provider: job.provider,
        providerJobId: job.provider_job_id,
        status: providerStatus.status,
        ...(providerStatus.output !== undefined ? { output: providerStatus.output } : {}),
      });
      reconciled++;
    } catch (error) {
      errors++;
      console.error(`Reconciliation failed for job ${job.id}:`, (error as Error).message);
    }
  }

  return { scanned: result.rows.length, reconciled, errors };
}

export function startReconciliationLoop(intervalMs = 60_000): void {
  const run = async () => {
    const result = await reconcilePendingJobs();
    console.log(`Reconciliation: scanned=${result.scanned} reconciled=${result.reconciled} errors=${result.errors}`);
  };

  void run();
  setInterval(() => void run(), intervalMs);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Reconciliation worker started');
  startReconciliationLoop();
}
