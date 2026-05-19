import { describe, it, expect } from 'vitest';
import { TokenPool, TokenPoolRegistry } from '../src/core/token-pool';

describe('TokenPool', () => {
  it('creates pool with tokens', () => {
    const pool = new TokenPool([
      { key: 'key1', weight: 2 },
      { key: 'key2', weight: 1 },
    ]);

    const stats = pool.getStats();
    expect(stats.total).toBe(2);
    expect(stats.available).toBe(2);
  });

  it('rotates tokens round-robin', () => {
    const pool = new TokenPool([
      { key: 'key1' },
      { key: 'key2' },
    ]);

    const t1 = pool.getNextToken();
    const t2 = pool.getNextToken();
    const t3 = pool.getNextToken();

    expect(t1?.key).toBe('key1');
    expect(t2?.key).toBe('key2');
    expect(t3?.key).toBe('key1');
  });

  it('respects rate limits', () => {
    const pool = new TokenPool([
      { key: 'key1', rateLimitPerMinute: 2 },
    ]);

    pool.getNextToken();
    pool.getNextToken();
    const exhausted = pool.getNextToken();

    expect(exhausted).toBeUndefined();
  });

  it('marks failed tokens', () => {
    const pool = new TokenPool([{ key: 'key1' }]);
    pool.markFailed('key1');

    const stats = pool.getStats();
    expect(stats.totalErrors).toBe(1);
  });

  it('weighted strategy', () => {
    const pool = new TokenPool([
      { key: 'heavy', weight: 10 },
      { key: 'light', weight: 1 },
    ]);
    pool.setStrategy('weighted');

    // Heavy should be selected more often
    let heavyCount = 0;
    for (let i = 0; i < 100; i++) {
      const token = pool.getNextToken();
      if (token?.key === 'heavy') heavyCount++;
    }

    expect(heavyCount).toBeGreaterThan(70);
  });
});

describe('TokenPoolRegistry', () => {
  it('creates and retrieves pools', () => {
    const registry = new TokenPoolRegistry();
    const pool = registry.createPool('openai', [
      { key: 'sk-1' },
      { key: 'sk-2' },
    ]);

    expect(registry.getPool('openai')).toBe(pool);
    expect(registry.getAllStats()).toHaveProperty('openai');
  });
});
