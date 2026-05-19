/**
 * Orium - Smart Router
 * Automatically selects the best adapter based on cost, speed, availability.
 * Now with concurrency limits and per-adapter rate limiting.
 */

import { ModelAdapter, CompletionRequest, CompletionResponse } from '../adapters/base';
import { adapters } from '../adapters/base';
import { AdapterConcurrencyManager } from '../utils/concurrency';
import { logger } from '../utils/logger';

export interface RoutingStrategy {
  name: string;
  select(adapters: ModelAdapter[], request: CompletionRequest): ModelAdapter | undefined;
}

export interface AdapterMetrics {
  adapter: string;
  avgLatency: number;
  successRate: number;
  lastUsed: number;
  errorCount: number;
  costPer1kTokens?: number;
}

export class SmartRouter {
  private metrics: Map<string, AdapterMetrics> = new Map();
  private strategies: Map<string, RoutingStrategy> = new Map();
  private defaultStrategy = 'fastest';
  private concurrency: AdapterConcurrencyManager;

  constructor(maxConcurrentPerAdapter = 5) {
    this.concurrency = new AdapterConcurrencyManager(maxConcurrentPerAdapter);

    this.registerStrategy({
      name: 'fastest',
      select: (list) => {
        return list
          .map((a) => ({ adapter: a, metric: this.getMetrics(a.name) }))
          .sort((a, b) => a.metric.avgLatency - b.metric.avgLatency)
          .find((a) => a.metric.successRate > 0.5)?.adapter;
      },
    });

    this.registerStrategy({
      name: 'cheapest',
      select: (list) => {
        return list
          .map((a) => ({ adapter: a, metric: this.getMetrics(a.name) }))
          .filter((a) => a.metric.costPer1kTokens !== undefined)
          .sort((a, b) => (a.metric.costPer1kTokens || Infinity) - (b.metric.costPer1kTokens || Infinity))
          .find((a) => a.metric.successRate > 0.5)?.adapter;
      },
    });

    this.registerStrategy({
      name: 'fallback',
      select: (list) => {
        for (const adapter of list) {
          const metric = this.getMetrics(adapter.name);
          if (metric.successRate > 0.5) return adapter;
        }
        return list[0];
      },
    });

    this.registerStrategy({
      name: 'round-robin',
      select: (list) => {
        const sorted = list
          .map((a) => ({ adapter: a, metric: this.getMetrics(a.name) }))
          .sort((a, b) => a.metric.lastUsed - b.metric.lastUsed);
        return sorted[0]?.adapter;
      },
    });

    this.registerStrategy({
      name: 'random',
      select: (list) => {
        const healthy = list.filter((a) => this.getMetrics(a.name).successRate > 0.5);
        return healthy[Math.floor(Math.random() * healthy.length)] || list[0];
      },
    });
  }

  registerStrategy(strategy: RoutingStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  setDefaultStrategy(name: string): void {
    this.defaultStrategy = name;
  }

  getMetrics(adapterName: string): AdapterMetrics {
    return (
      this.metrics.get(adapterName) || {
        adapter: adapterName,
        avgLatency: 1000,
        successRate: 1.0,
        lastUsed: 0,
        errorCount: 0,
        costPer1kTokens: undefined,
      }
    );
  }

  updateMetrics(adapterName: string, latency: number, success: boolean): void {
    const current = this.getMetrics(adapterName);
    const newLatency = current.avgLatency * 0.8 + latency * 0.2;
    const newSuccessRate = current.successRate * 0.9 + (success ? 1 : 0) * 0.1;

    this.metrics.set(adapterName, {
      ...current,
      avgLatency: newLatency,
      successRate: newSuccessRate,
      lastUsed: Date.now(),
      errorCount: success ? current.errorCount : current.errorCount + 1,
    });
  }

  setCost(adapterName: string, costPer1kTokens: number): void {
    const current = this.getMetrics(adapterName);
    this.metrics.set(adapterName, { ...current, costPer1kTokens });
  }

  /**
   * Route a request to the best available adapter with concurrency control.
   */
  async route(
    request: CompletionRequest,
    strategyName?: string
  ): Promise<{ adapter: ModelAdapter; response: CompletionResponse }> {
    const strategy = this.strategies.get(strategyName || this.defaultStrategy);
    if (!strategy) throw new Error(`Unknown strategy: ${strategyName}`);

    const allAdapters = adapters.list().map((name) => adapters.get(name)!);
    const selected = strategy.select(allAdapters, request);

    if (!selected) {
      throw new Error('No available adapter found');
    }

    logger.debug(`Routing to ${selected.name} with strategy ${strategyName || this.defaultStrategy}`);

    const start = Date.now();
    try {
      const response = await this.concurrency.execute(selected.name, () =>
        selected.complete(request)
      );
      this.updateMetrics(selected.name, Date.now() - start, true);
      return { adapter: selected, response };
    } catch (err) {
      this.updateMetrics(selected.name, Date.now() - start, false);
      throw err;
    }
  }

  /**
   * Route with automatic failover to next best adapter.
   */
  async routeWithFailover(
    request: CompletionRequest,
    strategyName?: string,
    maxRetries = 3
  ): Promise<{ adapter: ModelAdapter; response: CompletionResponse }> {
    const strategy = this.strategies.get(strategyName || this.defaultStrategy);
    if (!strategy) throw new Error(`Unknown strategy: ${strategyName}`);

    const allAdapters = adapters.list().map((name) => adapters.get(name)!);
    const sorted = allAdapters
      .map((a) => ({ adapter: a, metric: this.getMetrics(a.name) }))
      .sort((a, b) => b.metric.successRate - a.metric.successRate);

    let lastError: Error | undefined;

    for (let i = 0; i < Math.min(maxRetries, sorted.length); i++) {
      const selected = sorted[i].adapter;
      const start = Date.now();

      try {
        const response = await this.concurrency.execute(selected.name, () =>
          selected.complete(request)
        );
        this.updateMetrics(selected.name, Date.now() - start, true);
        return { adapter: selected, response };
      } catch (err) {
        this.updateMetrics(selected.name, Date.now() - start, false);
        lastError = err as Error;
        logger.warn(`Adapter ${selected.name} failed, trying next...`, { error: lastError.message });
      }
    }

    throw lastError || new Error('All adapters failed');
  }

  /**
   * Get current routing report.
   */
  getReport(): AdapterMetrics[] {
    return Array.from(this.metrics.values()).sort(
      (a, b) => b.successRate - a.successRate
    );
  }

  getConcurrencyStatus(): Array<{ adapter: string; available: number; waiting: number }> {
    return adapters.list().map((name) => {
      const limiter = this.concurrency.getLimiter(name);
      return { adapter: name, available: limiter.available, waiting: limiter.waiting };
    });
  }
}

export const router = new SmartRouter();
