import dotenv from 'dotenv';
import { pool } from './db.js';
import { getProvider } from './providers/index.js';
import { applyProviderEvent } from './webhooks/applyEvent.js';

dotenv.config();

const RUN_INTERVAL_MS = 30_000;
const PENDING_STUCK_AFTER_MS = 60_000;   // never picked up by a worker
const PROCESSING_STUCK_AFTER_MS = 60_000; // submitted, but no terminal update ever arrived

interface ReconciliationReport {
  checked: number;
  resolved: number;
  orphaned: number; // provider has no record of this job at all
  stillPending: number;
}

async function findStuckJobs() {
  const result = await pool.query(`
    SELECT * FROM jobs
    WHERE
      (status = 'processing' AND provider_job_id IS NOT NULL
        AND updated_at < now() - ($1 || ' milliseconds')::interval)
      OR
      (status = 'pending'
        AND created_at < now() - ($2 || ' milliseconds')::interval)
    ORDER BY created_at
  `, [PROCESSING_STUCK_AFTER_MS, PENDING_STUCK_AFTER_MS]);

  return result.rows;
}

async function reconcileJob(job: any, report: ReconciliationReport) {
  if (job.status === 'pending') {
    // No worker ever claimed it. Not a provider problem — flag it loudly,
    // this usually means the worker process is down or crashed.
    console.error(
      `ALERT: job ${job.id} has been pending for over ${PENDING_STUCK_AFTER_MS}ms with no worker pickup`
    );
    report.stillPending++;
    return;
  }

  // status === 'processing' with a provider_job_id — ask the provider directly.
  try {
    const adapter = getProvider(job.provider);
    const statusResult = await adapter.getJobStatus(job.provider_job_id);

    if (statusResult.status === 'processing') {
      // Provider genuinely still working on it — not a bug, just slow.
      return;
    }

    // Provider has a terminal result we never recorded — the webhook
    // was lost and the poller's own window hadn't caught it yet (or
    // the poller process itself was down). This is the case that
    // silently loses money in real systems if nothing catches it.
    await applyProviderEvent({
      provider: job.provider,
      providerJobId: job.provider_job_id,
      status: statusResult.status,
      output: statusResult.output,
    });
    console.warn(
      `RECONCILED: job ${job.id} was stuck in 'processing' — provider says ${statusResult.status}. Applied now.`
    );
    report.resolved++;
  } catch (err) {
    // Provider has no record of this job id at all — a true orphan.
    // Common causes: job id typo'd somewhere, or submitted successfully
    // but our DB write of provider_job_id failed after the fact.
    console.error(
      `ORPHAN: job ${job.id} (provider_job_id=${job.provider_job_id}) not found at provider: ${(err as Error).message}`
    );
    report.orphaned++;
  }
}

export async function runReconciliation(): Promise<ReconciliationReport> {
  const stuckJobs = await findStuckJobs();
  const report: ReconciliationReport = {
    checked: stuckJobs.length,
    resolved: 0,
    orphaned: 0,
    stillPending: 0,
  };

  for (const job of stuckJobs) {
    await reconcileJob(job, report);
  }

  console.log('Reconciliation run complete:', report);
  return report;
}

async function loop() {
  await runReconciliation().catch((err) => console.error('Reconciliation error:', err));
  setTimeout(loop, RUN_INTERVAL_MS);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Reconciliation job started...');
  loop();
}