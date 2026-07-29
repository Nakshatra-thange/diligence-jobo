import { pool } from '../db.js';
import { RetryableError, NonRetryableError } from './types.js';
import type {ProviderAdapter} from './types.js'

function randomFailure(): string | null {
  const roll = Math.random();
  if (roll < 0.10) return 'timeout';
  if (roll < 0.18) return 'rate_limited';
  if (roll < 0.20) return 'bad_input';
  return null;
}

export const fakeReplicate: ProviderAdapter = {
  name: 'replicate',

  async submitJob(input) {
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));

    const failure = randomFailure();
    if (failure === 'timeout') throw new RetryableError('Provider timed out on submit');
    if (failure === 'rate_limited') throw new RetryableError('429 rate limited by provider');
    if (failure === 'bad_input') throw new NonRetryableError('Provider rejected input: 400 bad_input');

    const providerJobId = `replicate_${Math.random().toString(36).slice(2)}`;
    const readyAt = new Date(Date.now() + 3000 + Math.random() * 2000);

    // Shared across processes via Postgres instead of an in-memory Map
    // — this is what a real external provider's own database does for you.
    await pool.query(
      `INSERT INTO fake_provider_jobs (provider_job_id, status, ready_at)
       VALUES ($1, 'processing', $2)`,
      [providerJobId, readyAt]
    );

    return { providerJobId };
  },

  async getJobStatus(providerJobId) {
    const result = await pool.query(
      `SELECT * FROM fake_provider_jobs WHERE provider_job_id = $1`,
      [providerJobId]
    );

    if (result.rows.length === 0) {
      throw new NonRetryableError(`Unknown provider job id: ${providerJobId}`);
    }

    const record = result.rows[0];

    if (record.status === 'processing' && new Date() >= new Date(record.ready_at)) {
      const output = { url: `https://fake-replicate.example/output/${providerJobId}.png` };
      await pool.query(
        `UPDATE fake_provider_jobs SET status = 'succeeded', output = $1 WHERE provider_job_id = $2`,
        [output, providerJobId]
      );
      return { status: 'succeeded', output };
    }

    if (record.status === 'succeeded') {
      return { status: 'succeeded', output: record.output };
    }

    return { status: record.status };
  },
};