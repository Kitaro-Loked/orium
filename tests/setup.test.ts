import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateConfig, generateYaml, generateEnvFile, generateExampleYaml } from '../src/setup/generators';
import { ADAPTER_PRESETS, getAdaptersByCategory, getPresetByName } from '../src/setup/adapters-preset';

describe('Setup Wizard', () => {
  describe('Adapter Presets', () => {
    it('has adapter presets for all categories', () => {
      const global = getAdaptersByCategory('global');
      const china = getAdaptersByCategory('china');
      const openSource = getAdaptersByCategory('open-source');

      expect(global.length).toBeGreaterThan(0);
      expect(china.length).toBeGreaterThan(0);
      expect(openSource.length).toBeGreaterThan(0);
    });

    it('finds preset by name', () => {
      const openai = getPresetByName('openai');
      expect(openai).toBeDefined();
      expect(openai?.displayName).toBe('OpenAI');
      expect(openai?.envKey).toBe('OPENAI_API_KEY');
    });

    it('returns undefined for unknown preset', () => {
      expect(getPresetByName('unknown')).toBeUndefined();
    });
  });

  describe('Config Generator', () => {
    it('generates config with adapters', () => {
      const config = generateConfig({
        useCase: 'personal',
        adapters: {
          openai: {
            enabled: true,
            apiKey: 'sk-test',
            models: ['gpt-4o'],
            priority: 1,
          },
        },
        services: {
          image: true,
          audio: false,
          video: false,
          embedding: true,
          code: true,
          document: false,
          multimodal: false,
          music: false,
          rag: false,
          fineTuning: false,
        },
        routing: {
          strategy: 'fastest',
          failover: true,
          maxRetries: 3,
        },
        memory: {
          workingCapacity: 7,
          shortTermCapacity: 100,
          longTermBackend: 'sqlite',
        },
        skills: ['tavily'],
      });

      expect(config.version).toBe('0.1.0');
      expect(config.adapters.openai).toBeDefined();
      expect(config.adapters.openai.enabled).toBe(true);
      expect(config.routing.strategy).toBe('fastest');
      expect(config.memory.workingCapacity).toBe(7);
    });

    it('generates valid YAML', () => {
      const config = generateConfig({
        useCase: 'enterprise',
        adapters: {},
        services: {} as any,
        routing: { strategy: 'round-robin', failover: true, maxRetries: 3 },
        memory: { workingCapacity: 10, shortTermCapacity: 200, longTermBackend: 'sqlite' },
        skills: [],
      });

      const yaml = generateYaml(config);
      expect(yaml).toContain('version: 0.1.0');
      expect(yaml).toContain('strategy: round-robin');
      expect(yaml).toContain('mode: cloud');
    });

    it('generates env file template', () => {
      const env = generateEnvFile({
        useCase: 'personal',
        adapters: {
          openai: { enabled: true, apiKey: 'sk-test' },
        },
        services: {} as any,
        routing: {} as any,
        memory: {} as any,
        skills: ['tavily', 'nobana'],
      });

      expect(env).toContain('OPENAI_API_KEY=sk-test');
      expect(env).toContain('TAVILY_API_KEY=');
      expect(env).toContain('NOBANA_API_KEY=');
    });

    it('generates example YAML', () => {
      const yaml = generateExampleYaml();
      expect(yaml).toContain('openai:');
      expect(yaml).toContain('anthropic:');
      expect(yaml).toContain('deepseek:');
    });
  });
});
