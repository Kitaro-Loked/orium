import { describe, it, expect } from 'vitest';
import { router, SmartRouter } from '../src/core/router';
import { adapters, OpenAIAdapter, AnthropicAdapter } from '../src/adapters/index';

describe('SmartRouter', () => {
  it('registers default strategies', () => {
    expect(router).toBeDefined();
  });

  it('can set cost metrics', () => {
    router.setCost('openai', 0.01);
    const metrics = router.getMetrics('openai');
    expect(metrics.costPer1kTokens).toBe(0.01);
  });

  it('updates metrics on success', () => {
    router.updateMetrics('openai', 100, true);
    const metrics = router.getMetrics('openai');
    expect(metrics.avgLatency).toBeLessThan(1000);
    expect(metrics.successRate).toBeGreaterThan(0.5);
  });

  it('updates metrics on failure', () => {
    router.updateMetrics('fake', 500, false);
    const metrics = router.getMetrics('fake');
    expect(metrics.errorCount).toBeGreaterThan(0);
    expect(metrics.successRate).toBeLessThan(1);
  });

  it('generates routing report', () => {
    adapters.register(new OpenAIAdapter('fake'));
    adapters.register(new AnthropicAdapter('fake'));

    router.updateMetrics('openai', 100, true);
    router.updateMetrics('anthropic', 200, true);

    const report = router.getReport();
    expect(report.length).toBeGreaterThanOrEqual(2);
  });
});
