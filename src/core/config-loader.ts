/**
 * Orium - Unified Configuration Loader
 * Loads config from YAML, JSON, env vars, with merging and validation.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export interface OriumConfig {
  version: string;
  runtime: {
    mode: 'local' | 'cloud' | 'hybrid';
    workers: number;
    timeout: number;
  };
  adapters: Record<string, AdapterConfig>;
  routing: {
    strategy: string;
    failover: boolean;
    maxRetries: number;
  };
  tokenPools: Record<string, TokenPoolConfig>;
  memory: {
    workingCapacity: number;
    shortTermCapacity: number;
    longTermBackend: string;
  };
  tools: {
    mcpEnabled: boolean;
    allowedTools: string[];
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'pretty';
  };
}

export interface AdapterConfig {
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  models?: string[];
  priority?: number;
  costPer1kTokens?: number;
  [key: string]: unknown;
}

export interface TokenPoolConfig {
  strategy: 'round-robin' | 'weighted' | 'least-used' | 'priority';
  tokens: Array<{
    key: string;
    weight?: number;
    rateLimitPerMinute?: number;
    rateLimitPerDay?: number;
    priority?: number;
  }>;
}

const DEFAULT_CONFIG: OriumConfig = {
  version: '0.1.0',
  runtime: {
    mode: 'hybrid',
    workers: 4,
    timeout: 30000,
  },
  adapters: {},
  routing: {
    strategy: 'fastest',
    failover: true,
    maxRetries: 3,
  },
  tokenPools: {},
  memory: {
    workingCapacity: 7,
    shortTermCapacity: 100,
    longTermBackend: 'sqlite',
  },
  tools: {
    mcpEnabled: true,
    allowedTools: ['*'],
  },
  logging: {
    level: 'info',
    format: 'pretty',
  },
};

export class ConfigLoader {
  private config: OriumConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  /**
   * Load from file (YAML or JSON).
   */
  loadFile(path: string): this {
    if (!existsSync(path)) {
      console.warn(`Config file not found: ${path}`);
      return this;
    }

    const content = readFileSync(path, 'utf-8');
    let parsed: Partial<OriumConfig>;

    if (path.endsWith('.yaml') || path.endsWith('.yml')) {
      parsed = this.parseYaml(content);
    } else {
      parsed = JSON.parse(content);
    }

    this.merge(parsed);
    return this;
  }

  /**
   * Load from environment variables.
   */
  loadEnv(): this {
    const envConfig: Partial<OriumConfig> = {};

    // Runtime
    if (process.env.ORIUM_RUNTIME_MODE) {
      envConfig.runtime = {
        ...this.config.runtime,
        mode: process.env.ORIUM_RUNTIME_MODE as any,
      };
    }
    if (process.env.ORIUM_WORKERS) {
      envConfig.runtime = {
        ...envConfig.runtime,
        ...this.config.runtime,
        workers: parseInt(process.env.ORIUM_WORKERS),
      };
    }

    // Routing
    if (process.env.ORIUM_ROUTING_STRATEGY) {
      envConfig.routing = {
        ...this.config.routing,
        strategy: process.env.ORIUM_ROUTING_STRATEGY,
      };
    }

    // Logging
    if (process.env.ORIUM_LOG_LEVEL) {
      envConfig.logging = {
        ...this.config.logging,
        level: process.env.ORIUM_LOG_LEVEL as any,
      };
    }

    this.merge(envConfig);
    return this;
  }

  /**
   * Load from default locations.
   */
  loadDefaults(): this {
    const paths = [
      resolve(process.cwd(), 'orium.yaml'),
      resolve(process.cwd(), 'orium.yml'),
      resolve(process.cwd(), 'orium.json'),
      resolve(process.cwd(), '.orium.yaml'),
      resolve(process.cwd(), '.orium.yml'),
      resolve(process.cwd(), '.orium.json'),
      resolve(process.cwd(), 'configs', 'orium.yaml'),
      resolve(process.env.HOME || process.env.USERPROFILE || '', '.config', 'orium', 'config.yaml'),
    ];

    for (const path of paths) {
      if (existsSync(path)) {
        this.loadFile(path);
        break;
      }
    }

    this.loadEnv();
    return this;
  }

  private merge(source: Partial<OriumConfig>): void {
    this.config = this.deepMerge(this.config, source);
  }

  private deepMerge(target: any, source: any): any {
    if (!source) return target;
    const result = { ...target };

    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  private parseYaml(content: string): any {
    // Simple YAML parser - in production use js-yaml
    const result: any = {};
    const lines = content.split('\n');
    let current: any = result;
    const stack: any[] = [];
    let indent = 0;

    for (const line of lines) {
      if (!line.trim() || line.trim().startsWith('#')) continue;

      const match = line.match(/^(\s*)(\w+):\s*(.*)$/);
      if (!match) continue;

      const [, spaces, key, value] = match;
      const level = spaces.length;

      while (stack.length > 0 && level <= indent) {
        current = stack.pop()!;
        indent -= 2;
      }

      if (value) {
        // Parse value
        let parsed: any = value;
        if (value === 'true') parsed = true;
        else if (value === 'false') parsed = false;
        else if (/^\d+$/.test(value)) parsed = parseInt(value);
        else if (/^\d+\.\d+$/.test(value)) parsed = parseFloat(value);
        else if (value.startsWith('[') && value.endsWith(']')) {
          parsed = value.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
        }
        current[key] = parsed;
      } else {
        current[key] = {};
        stack.push(current);
        current = current[key];
        indent = level;
      }
    }

    return result;
  }

  get(): OriumConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  getAdapter(name: string): AdapterConfig | undefined {
    return this.config.adapters[name];
  }

  getEnabledAdapters(): [string, AdapterConfig][] {
    return Object.entries(this.config.adapters).filter(([, c]) => c.enabled);
  }
}

export const configLoader = new ConfigLoader();
