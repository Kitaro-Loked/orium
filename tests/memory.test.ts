import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../src/memory/store';

describe('MemoryStore', () => {
  it('stores and retrieves from working memory', () => {
    const store = new MemoryStore();
    store.setWorking({
      id: 'w1',
      content: 'Hello world',
      type: 'fact',
      importance: 0.8,
      timestamp: Date.now(),
    });

    expect(store.getWorking().length).toBe(1);
    expect(store.getWorking()[0].content).toBe('Hello world');
  });

  it('retrieves by keyword across all tiers', () => {
    const store = new MemoryStore();
    store.setWorking({
      id: 'w1',
      content: 'The sky is blue',
      type: 'fact',
      importance: 0.5,
      timestamp: Date.now(),
    });
    store.setShortTerm({
      id: 's1',
      content: 'Blue is my favorite color',
      type: 'preference',
      importance: 0.9,
      timestamp: Date.now(),
    });

    const results = store.retrieve('blue');
    expect(results.length).toBe(2);
    expect(results[0].importance).toBe(0.9); // sorted by importance
  });

  it('clears all memory', () => {
    const store = new MemoryStore();
    store.setWorking({ id: 'w1', content: 'x', type: 'fact', importance: 1, timestamp: 0 });
    store.clear();
    expect(store.getWorking().length).toBe(0);
    expect(store.getShortTerm().length).toBe(0);
    expect(store.getLongTerm().length).toBe(0);
  });
});
