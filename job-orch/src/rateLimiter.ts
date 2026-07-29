interface BucketConfig {
    capacity: number;     
    refillPerSec: number; 
  }
  
  class TokenBucket {
    private tokens: number;
    private lastRefill: number;
  
    constructor(private config: BucketConfig) {
      this.tokens = config.capacity;
      this.lastRefill = Date.now();
    }
  
    private refill() {
      const now = Date.now();
      const elapsedSec = (now - this.lastRefill) / 1000;
      const toAdd = elapsedSec * this.config.refillPerSec;
      this.tokens = Math.min(this.config.capacity, this.tokens + toAdd);
      this.lastRefill = now;
    }
  
    tryConsume(): boolean {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return true;
      }
      return false;
    }
  
    msUntilNextToken(): number {
      this.refill();
      if (this.tokens >= 1) return 0;
      const deficit = 1 - this.tokens;
      return Math.ceil((deficit / this.config.refillPerSec) * 1000);
    }
  }
  
  // Rough real-world numbers: Replicate tolerates more burst,
  // ElevenLabs is tighter — matches the failure profiles in Part 2.
  const buckets: Record<string, TokenBucket> = {
    replicate: new TokenBucket({ capacity: 10, refillPerSec: 5 }),
    elevenlabs: new TokenBucket({ capacity: 4, refillPerSec: 1 }),
  };
  
  export function getBucket(provider: string): TokenBucket {
    if (!buckets[provider]) {
      buckets[provider] = new TokenBucket({ capacity: 5, refillPerSec: 2 });
    }
    return buckets[provider];
  }