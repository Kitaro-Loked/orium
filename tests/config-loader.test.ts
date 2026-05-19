import { describe, it, expect } from 'vitest';
import { ConfigLoader } from '../src/core/config-loader';

describe('ConfigLoader', () => {
  it('loads default config', () => {
    const loader = new ConfigLoader();
    const config = loader.get();

    expect(config.version).toBe('0.1.0');
    expect(config.runtime.mode).toBe('hybrid');
    expect(config.routing.strategy).toBe('fastest');
  });

  it('merges partial config', () => {
    const loader = new ConfigLoader();
    loader.loadFile('nonexistent.yaml'); // should be skipped

    const config = loader.get();
    expect(config.runtime.workers).toBe(4);
  });

  it('gets enabled adapters', () => {
    const loader = new ConfigLoader();
    const enabled = loader.getEnabledAdapters();
    expect(enabled).toEqual([]);
  });
});
