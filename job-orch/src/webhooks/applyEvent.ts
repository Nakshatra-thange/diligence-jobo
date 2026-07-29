import { pool } from '../db.js';

interface ProviderEvent {
  provider: string;
  providerJobId: string;
  status: 'processing' | 'succeeded' | 'failed';
  output?: Record<string, unknown>;
  errorMessage?: string;
}

const STATUS_RANK: Record<'pending' | ProviderEvent['status'], number> = {
  pending: 0,
  processing: 1,
  succeeded: 2,
  failed: 2, 
};

const TERMINAL = new Set(['succeeded', 'failed']);

export async function applyProviderEvent(event: ProviderEvent) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT * FROM jobs WHERE provider = $1 AND provider_job_id = $2 FOR UPDATE`,
      [event.provider, event.providerJobId]
    );

    if (result.rows.length === 0) {
 
      await client.query('ROLLBACK');
      console.warn(
        `No job found for ${event.provider}/${event.providerJobId} — event recorded, will reconcile later`
      );
      return;
    }

    const job = result.rows[0];

    if (TERMINAL.has(job.status)) {
      
      await client.query('ROLLBACK');
      console.log(
        `Ignoring event for job ${job.id}: already terminal (${job.status})`
      );
      return;
    }

    const currentStatusRank = STATUS_RANK[job.status as keyof typeof STATUS_RANK] ?? -1;
    if (STATUS_RANK[event.status] < currentStatusRank) {

      await client.query('ROLLBACK');
      console.log(
        `Ignoring stale event for job ${job.id}: ${event.status} arrived after ${job.status}`
      );
      return;
    }

    await client.query(
      `UPDATE jobs
       SET status = $1, output = $2, last_error = $3, updated_at = now()
       WHERE id = $4`,
      [
        event.status,
        event.output ? JSON.stringify(event.output) : job.output,
        event.errorMessage ?? job.last_error,
        job.id,
      ]
    );

    await client.query('COMMIT');
    console.log(`Job ${job.id} updated to ${event.status}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
