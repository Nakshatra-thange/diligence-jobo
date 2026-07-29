import {  RetryableError, NonRetryableError } from './types.js';
import type {ProviderAdapter} from './types.js'

import { pool } from '../db.js';


function randomFailure(): string | null {
  const roll = Math.random();
  if (roll < 0.05) return 'timeout';
  if (roll < 0.25) return 'rate_limited';
  return null;
}

export const fakeElevenLabs: ProviderAdapter = {
  name: 'elevenlabs',

  async submitJob(input) {
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 200));

    const failure = randomFailure();
    if (failure === 'timeout') throw new RetryableError('Provider timed out on submit');
    if (failure === 'rate_limited') throw new RetryableError('429 rate limited by provider');

    const providerJobId = `elevenlabs_${Math.random().toString(36).slice(2)}`;
    const readyAt = new Date(Date.now() + 1500 + Math.random() * 1500);

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
      const output = { audioUrl: `https://fake-elevenlabs.example/output/${providerJobId}.mp3` };
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