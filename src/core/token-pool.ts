/**
 * Orium - Token Pool Manager
 * Multi-key rotation, load balancing, rate limit handling.
 */

export interface TokenConfig {
  key: string;
  weight?: number;
  rateLimitPerMinute?: number;
  rateLimitPerDay?: number;
  priority?: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

export interface TokenState {
  config: TokenConfig;
  usedCount: number;
  errorCount: number;
  lastUsed: number;
  minuteWindow: number[];
  dayWindow: number[];
  isExhausted: boolean;
}

export class TokenPool {
  private tokens: TokenState[] = [];
  private currentIndex = 0;
  private strategy: 'round-robin' | 'weighted' | 'least-used' | 'priority' = 'round-robin';

  constructor(tokens: TokenConfig[] = []) {
    for (const token of tokens) {
      this.addToken(token);
    }
  }

  addToken(config: TokenConfig): void {
    this.tokens.push({
      config,
      usedCount: 0,
      errorCount: 0,
      lastUsed: 0,
      minuteWindow: [],
      dayWindow: [],
      isExhausted: false,
    });
  }

  removeToken(key: string): void {
    this.tokens = this.tokens.filter((t) => t.config.key !== key);
  }

  setStrategy(strategy: 'round-robin' | 'weighted' | 'least-used' | 'priority'): void {
    this.strategy = strategy;
  }

  private cleanWindows(): void {
    const now = Date.now();
    const minuteAgo = now - 60000;
    const dayAgo = now - 86400000;

    for (const token of this.tokens) {
      token.minuteWindow = token.minuteWindow.filter((t) => t > minuteAgo);
      token.dayWindow = token.dayWindow.filter((t) => t > dayAgo);

      // Check if token is exhausted
      const rpm = token.config.rateLimitPerMinute;
      const rpd = token.config.rateLimitPerDay;

      token.isExhausted = false;
      if (rpm !== undefined && token.minuteWindow.length >= rpm) {
        token.isExhausted = true;
      }
      if (rpd !== undefined && token.dayWindow.length >= rpd) {
        token.isExhausted = true;
      }
      if (token.config.expiresAt && now > token.config.expiresAt) {
        token.isExhausted = true;
      }
    }
  }

  private getAvailableTokens(): TokenState[] {
    this.cleanWindows();
    return this.tokens.filter((t) => !t.isExhausted);
  }

  /**
   * Get the next token based on current strategy.
   */
  getNextToken(): TokenConfig | undefined {
    const available = this.getAvailableTokens();
    if (available.length === 0) return undefined;

    let selected: TokenState;

    switch (this.strategy) {
      case 'round-robin': {
        selected = available[this.currentIndex % available.length];
        this.currentIndex++;
        break;
      }

      case 'weighted': {
        const totalWeight = available.reduce(
          (sum, t) => sum + (t.config.weight || 1),
          0
        );
        let random = Math.random() * totalWeight;
        selected = available[0];
        for (const token of available) {
          random -= token.config.weight || 1;
          if (random <= 0) {
            selected = token;
            break;
          }
        }
        break;
      }

      case 'least-used': {
        selected = available.sort((a, b) => a.usedCount - b.usedCount)[0];
        break;
      }

      case 'priority': {
        selected = available.sort(
          (a, b) => (b.config.priority || 0) - (a.config.priority || 0)
        )[0];
        break;
      }

      default:
        selected = available[0];
    }

    // Update state
    selected.usedCount++;
    selected.lastUsed = Date.now();
    selected.minuteWindow.push(Date.now());
    selected.dayWindow.push(Date.now());

    return selected.config;
  }

  /**
   * Mark a token as failed (for retry logic).
   */
  markFailed(key: string): void {
    const token = this.tokens.find((t) => t.config.key === key);
    if (token) {
      token.errorCount++;
      // Temporarily exhaust if too many errors
      if (token.errorCount > 5) {
        token.isExhausted = true;
        // Auto-recover after 5 minutes
        setTimeout(() => {
          token.isExhausted = false;
          token.errorCount = 0;
        }, 300000);
      }
    }
  }

  /**
   * Mark a token as succeeded.
   */
  markSuccess(key: string): void {
    const token = this.tokens.find((t) => t.config.key === key);
    if (token) {
      token.errorCount = Math.max(0, token.errorCount - 1);
    }
  }

  /**
   * Get pool statistics.
   */
  getStats(): {
    total: number;
    available: number;
    exhausted: number;
    totalUsed: number;
    totalErrors: number;
  } {
    this.cleanWindows();
    return {
      total: this.tokens.length,
      available: this.tokens.filter((t) => !t.isExhausted).length,
      exhausted: this.tokens.filter((t) => t.isExhausted).length,
      totalUsed: this.tokens.reduce((sum, t) => sum + t.usedCount, 0),
      totalErrors: this.tokens.reduce((sum, t) => sum + t.errorCount, 0),
    };
  }

  /**
   * Get all token states.
   */
  getTokenStates(): TokenState[] {
    this.cleanWindows();
    return this.tokens.map((t) => ({ ...t }));
  }
}

/**
 * Per-adapter token pool registry.
 */
export class TokenPoolRegistry {
  private pools: Map<string, TokenPool> = new Map();

  createPool(adapterName: string, tokens: TokenConfig[]): TokenPool {
    const pool = new TokenPool(tokens);
    this.pools.set(adapterName, pool);
    return pool;
  }

  getPool(adapterName: string): TokenPool | undefined {
    return this.pools.get(adapterName);
  }

  removePool(adapterName: string): void {
    this.pools.delete(adapterName);
  }

  getAllStats(): Record<string, ReturnType<TokenPool['getStats']>> {
    const stats: Record<string, ReturnType<TokenPool['getStats']>> = {};
    for (const [name, pool] of this.pools) {
      stats[name] = pool.getStats();
    }
    return stats;
  }
}

export const tokenPools = new TokenPoolRegistry();
