import {  RetryableError, NonRetryableError } from './types.js';
import type {ProviderAdapter} from './types.js'

const fakeJobStore = new Map<
  string,
  { status: 'processing' | 'succeeded' | 'failed'; readyAt: number }
>();

function randomFailure(): string | null {
  const roll = Math.random();
  if (roll < 0.05) return 'timeout';
  if (roll < 0.25) return 'rate_limited'; // ElevenLabs quotas are tight in practice
  return null;
}

export const fakeElevenLabs: ProviderAdapter = {
  name: 'elevenlabs',

  async submitJob(input) {
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 200));

    const failure = randomFailure();
    if (failure === 'timeout') {
      throw new RetryableError('Provider timed out on submit');
    }
    if (failure === 'rate_limited') {
      throw new RetryableError('429 rate limited by provider');
    }

    const providerJobId = `elevenlabs_${Math.random().toString(36).slice(2)}`;
    fakeJobStore.set(providerJobId, {
      status: 'processing',
      readyAt: Date.now() + 1500 + Math.random() * 1500,
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
        output: { audioUrl: `https://fake-elevenlabs.example/output/${providerJobId}.mp3` },
      };
    }

    return { status: record.status };
  },
};