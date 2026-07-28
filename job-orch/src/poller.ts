import dotenv from 'dotenv';
import { pool } from './db.js';
import { getProvider } from './providers/index.js';
import { applyProviderEvent } from './webhooks/applyEvent.js';

dotenv.config();

const POLL_INTERVAL_MS = 5000;
const STALE_AFTER_MS = 4000; // don't poll something webhooks just updated seconds ago

async function pollProcessingJobs() {
  const result = await pool.query(
    `SELECT * FROM jobs
     WHERE status = 'processing'
       AND provider_job_id IS NOT NULL
       AND updated_at < now() - ($1 || ' milliseconds')::interval`,
    [STALE_AFTER_MS]
  );

  for (const job of result.rows) {
    try {
      const adapter = getProvider(job.provider);
      const statusResult = await adapter.getJobStatus(job.provider_job_id);

      if (statusResult.status !== 'processing') {
        await applyProviderEvent({
            provider: job.provider,
            providerJobId: job.provider_job_id,
            status: statusResult.status,
            ...(statusResult.output !== undefined && {
              output: statusResult.output,
            }),
          });;
      }
      // still processing — nothing to do, will check again next tick
    } catch (err) {
      console.error(`Poll failed for job ${job.id}:`, (err as Error).message);
    }
  }
}

async function loop() {
  await pollProcessingJobs().catch((err) => console.error('Poller error:', err));
  setTimeout(loop, POLL_INTERVAL_MS);
}

console.log('Poller started — sweeping stale "processing" jobs...');
loop();