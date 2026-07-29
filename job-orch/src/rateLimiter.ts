/**
 * Small in-memory token bucket used by the worker before it submits work to a
 * provider. Buckets are intentionally per provider: a burst of ElevenLabs
 * requests must not consume Replicate's allowance.
 *
 * A distributed deployment should back this with Redis (or the queue itself),
 * but keeping this seam local makes the worker safe for a single process and
 * makes provider limits explicit in one place.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefillAt = Date.now();

  constructor(
    private readonly capacity: number,
    private readonly refillEveryMs: number
  ) {
    if (capacity <= 0 || refillEveryMs <= 0) {
      throw new Error('Token bucket capacity and refill interval must be positive');
    }
    this.tokens = capacity;
  }

  tryConsume(tokens = 1): boolean {
    if (tokens <= 0) {
      throw new Error('Token count must be positive');
    }

    this.refill();
    if (this.tokens < tokens) return false;

    this.tokens -= tokens;
    return true;
  }

  msUntilNextToken(): number {
    this.refill();
    if (this.tokens >= 1) return 0;

    const elapsed = Date.now() - this.lastRefillAt;
    return Math.max(1, this.refillEveryMs - elapsed);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillAt;
    const tokensToAdd = Math.floor(elapsed / this.refillEveryMs);
    if (tokensToAdd <= 0) return;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefillAt += tokensToAdd * this.refillEveryMs;
  }
}

const providerLimits: Record<string, { capacity: number; refillEveryMs: number }> = {
  // Keep the sample conservative; production values should come from each
  // provider's documented quota or account-level configuration.
  replicate: { capacity: 10, refillEveryMs: 1_000 },
  elevenlabs: { capacity: 5, refillEveryMs: 1_000 },
};

const buckets = new Map<string, TokenBucket>();

export function getBucket(providerName: string): TokenBucket {
  let bucket = buckets.get(providerName);
  if (!bucket) {
    const limit = providerLimits[providerName] ?? { capacity: 3, refillEveryMs: 1_000 };
    bucket = new TokenBucket(limit.capacity, limit.refillEveryMs);
    buckets.set(providerName, bucket);
  }
  return bucket;
}
