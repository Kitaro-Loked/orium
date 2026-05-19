/**
 * Orium - Concurrency Control
 * Semaphore and request limiting utilities.
 */

export class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
  }

  release(): void {
    const resolve = this.queue.shift();
    if (resolve) {
      resolve();
    } else {
      this.permits++;
    }
  }

  get available(): number {
    return this.permits;
  }

  get waiting(): number {
    return this.queue.length;
  }
}

export class ConcurrencyLimiter {
  private semaphore: Semaphore;

  constructor(maxConcurrent: number) {
    this.semaphore = new Semaphore(maxConcurrent);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.semaphore.acquire();
    try {
      return await fn();
    } finally {
      this.semaphore.release();
    }
  }

  get available(): number {
    return this.semaphore.available;
  }

  get waiting(): number {
    return this.semaphore.waiting;
  }
}

/** Per-adapter concurrency limits */
export class AdapterConcurrencyManager {
  private limits: Map<string, ConcurrencyLimiter> = new Map();
  private defaultLimit: number;

  constructor(defaultLimit = 5) {
    this.defaultLimit = defaultLimit;
  }

  getLimiter(adapterName: string): ConcurrencyLimiter {
    if (!this.limits.has(adapterName)) {
      this.limits.set(adapterName, new ConcurrencyLimiter(this.defaultLimit));
    }
    return this.limits.get(adapterName)!;
  }

  setLimit(adapterName: string, limit: number): void {
    this.limits.set(adapterName, new ConcurrencyLimiter(limit));
  }

  async execute<T>(adapterName: string, fn: () => Promise<T>): Promise<T> {
    const limiter = this.getLimiter(adapterName);
    return limiter.execute(fn);
  }
}
