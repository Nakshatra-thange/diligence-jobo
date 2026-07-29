import dotenv from 'dotenv';
import { pool } from './db.js';
import { getProvider } from './providers/index.js';
import { withRetry } from './providers/retry.js';
import { getBreaker } from './providers/circuitBreaker.js';
import { getBucket } from './rateLimiter.js';

dotenv.config();

const POLL_INTERVAL_MS = 2000;

async function claimNextJob() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT * FROM jobs
      WHERE status = 'pending'
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const job = result.rows[0];
    await client.query(`UPDATE jobs SET status = 'processing', updated_at = now() WHERE id = $1`, [job.id]);
    await client.query('COMMIT');
    return job;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function processJob(job: any) {
  const adapter = getProvider(job.provider);
  const breaker = getBreaker(job.provider);
  const bucket = getBucket(job.provider);

  // Rate limit check happens before we even attempt the call — this is
  // what prevents the 429s in Part 2 from happening in the first place,
  // rather than just cleaning them up after.
  if (!bucket.tryConsume()) {
    const waitMs = bucket.msUntilNextToken();
    console.log(`Rate limit: deferring job ${job.id} for ${waitMs}ms (${job.provider})`);
    await pool.query(`UPDATE jobs SET status = 'pending', updated_at = now() WHERE id = $1`, [job.id]);
    await new Promise((r) => setTimeout(r, waitMs));
    return;
  }

  try {
    const { providerJobId } = await breaker.execute(() =>
      withRetry(() => adapter.submitJob(job.input))
    );
    await pool.query(
      `UPDATE jobs SET provider_job_id = $1, attempts = attempts + 1, updated_at = now() WHERE id = $2`,
      [providerJobId, job.id]
    );
    console.log(`Job ${job.id} submitted to ${job.provider} as ${providerJobId}`);
  } catch (err) {
    const message = (err as Error).message;
    await pool.query(
      `UPDATE jobs SET status = 'failed', attempts = attempts + 1, last_error = $1, updated_at = now() WHERE id = $2`,
      [message, job.id]
    );
    console.error(`Job ${job.id} failed permanently: ${message}`);
  }
}

async function pollLoop() {
  const job = await claimNextJob().catch((err) => { console.error('Error claiming job:', err); return null; });
  if (job) {
    await processJob(job);
    setImmediate(pollLoop);
  } else {
    setTimeout(pollLoop, POLL_INTERVAL_MS);
  }
}

console.log('Worker started, polling for pending jobs...');
pollLoop();