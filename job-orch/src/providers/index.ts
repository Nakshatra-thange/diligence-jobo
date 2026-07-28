import { ProviderAdapter } from './types.js';
import { fakeReplicate } from './fakeReplicate.js';
import { fakeElevenLabs } from './fakeElevenLabs.js';

const registry: Record<string, ProviderAdapter> = {
  replicate: fakeReplicate,
  elevenlabs: fakeElevenLabs,
};

export function getProvider(name: string): ProviderAdapter {
  const adapter = registry[name];
  if (!adapter) {
    throw new Error(`No adapter registered for provider: ${name}`);
  }
  return adapter;
}