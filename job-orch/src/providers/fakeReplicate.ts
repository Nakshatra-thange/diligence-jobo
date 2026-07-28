import {  RetryableError, NonRetryableError } from './types.js';
import type {ProviderAdapter} from './types.js'

// In-memory store standing in for "Replicate's servers" so getJobStatus
// has something to report back later.
const fakeJobStore = new Map<
  string,
  { status: 'processing' | 'succeeded' | 'failed'; readyAt: number }
>();

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
    if (failure === 'timeout') {
      throw new RetryableError('Provider timed out on submit');
    }
    if (failure === 'rate_limited') {
      throw new RetryableError('429 rate limited by provider');
    }
    if (failure === 'bad_input') {
      // Not retryable — no amount of retrying fixes a bad prompt.
      throw new NonRetryableError('Provider rejected input: 400 bad_input');
    }

    const providerJobId = `replicate_${Math.random().toString(36).slice(2)}`;
    fakeJobStore.set(providerJobId, {
      status: 'processing',
      readyAt: Date.now() + 3000 + Math.random() * 2000,
    });

    return { providerJobId };
  },

  async getJobStatus(providerJobId) {
    const record = fakeJobStore.get(providerJobId);
    if (!record) {
      throw new NonRetryableError(`Unknown provider job id: ${providerJobId}`);
    }

    if (record.status === 'processing' && Date.now() >= record.readyAt) {
      record.status = 'succeeded';
    }

    if (record.status === 'succeeded') {
      return {
        status: 'succeeded',
        output: { url: `https://fake-replicate.example/output/${providerJobId}.png` },
      };
    }

    return { status: record.status };
  },
};