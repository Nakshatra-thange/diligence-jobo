import { pool } from '../db.js';

interface ProviderEvent {
  provider: string;
  providerJobId: string;
  status: 'processing' | 'succeeded' | 'failed';
  output?: Record<string, unknown>;
  errorMessage?: string;
}

// Rank lets us compare "how far along" a status is, so we can ignore
// an event that's older/less-advanced than what we already recorded.
const STATUS_RANK: Record<string, number> = {
  pending: 0,
  processing: 1,
  succeeded: 2,
  failed: 2, // succeeded/failed are both terminal — neither outranks the other
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
      // Job not found yet — can happen if a webhook races ahead of our
      // own DB write after submitJob(). We don't lose the event: it's
      // already durably stored in webhook_events by the caller, and
      // the Part 4 reconciliation job will catch anything that stays
      // stuck. Nothing more to do here right now.
      await client.query('ROLLBACK');
      console.warn(
        `No job found for ${event.provider}/${event.providerJobId} — event recorded, will reconcile later`
      );
      return;
    }

    const job = result.rows[0];

    if (TERMINAL.has(job.status)) {
      // Already terminal — ignore anything arriving after (e.g. a
      // stale "processing" event arriving after "succeeded" due to
      // network reordering, or a duplicate terminal event resending).
      await client.query('ROLLBACK');
      console.log(
        `Ignoring event for job ${job.id}: already terminal (${job.status})`
      );
      return;
    }

    if (STATUS_RANK[event.status] < STATUS_RANK[job.status]) {
      // Out-of-order: this event represents an earlier stage than what
      // we've already recorded. Drop it.
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