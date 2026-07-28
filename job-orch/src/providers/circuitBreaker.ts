type CircuitState = 'closed' | 'open' | 'half_open';

interface BreakerConfig {
  failureThreshold: number; // consecutive failures before opening
  cooldownMs: number;       // how long to stay open before trying again
}

class CircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;

  constructor(
    private readonly name: string,
    private readonly config: BreakerConfig = { failureThreshold: 5, cooldownMs: 15000 }
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed < this.config.cooldownMs) {
        throw new Error(
          `Circuit open for provider "${this.name}" — failing fast (retry in ${Math.round((this.config.cooldownMs - elapsed) / 1000)}s)`
        );
      }
      // cooldown elapsed — allow exactly one trial call
      this.state = 'half_open';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.consecutiveFailures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.consecutiveFailures++;

    if (this.state === 'half_open') {
      // the trial call failed — the provider is still down
      this.state = 'open';
      this.openedAt = Date.now();
      return;
    }

    if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.state = 'open';
      this.openedAt = Date.now();
      console.error(`Circuit breaker OPENED for provider "${this.name}"`);
    }
  }

  getState() {
    return this.state;
  }
}

const breakers = new Map<string, CircuitBreaker>();

export function getBreaker(providerName: string): CircuitBreaker {
  if (!breakers.has(providerName)) {
    breakers.set(providerName, new CircuitBreaker(providerName));
  }
  return breakers.get(providerName)!;
}