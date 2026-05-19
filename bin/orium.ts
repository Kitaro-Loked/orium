#!/usr/bin/env node
/**
 * Orium CLI
 * Command-line interface for the Orium AI infrastructure.
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runWizard } from '../src/setup/wizard.js';
import { startRepl } from '../src/chat/repl.js';
import { ConfigLoader } from '../src/core/config-loader.js';
import { AdapterRegistry } from '../src/adapters/base.js';
import { autoRegisterAdapters } from '../src/adapters/index.js';
import { OriumServer, OriumWebSocketServer } from '../src/server/index.js';
import { SkillRegistry } from '../src/skills/base.js';
import { TavilySkill } from '../src/skills/search/tavily.js';
import { SerperSkill } from '../src/skills/search/serper.js';
import { EastMoneySkill } from '../src/skills/finance/eastmoney.js';
import { AlphaVantageSkill } from '../src/skills/finance/alphavantage.js';
import { FirecrawlSkill } from '../src/skills/web/firecrawl.js';
import { NobanaSkill } from '../src/skills/nobana.js';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
};

// Read version from package.json
let version = '0.1.0';
try {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));
  version = pkg.version;
} catch {
  // Fallback version
}

const program = new Command();

program
  .name('orium')
  .description('Orium - The Foundational Element of Intelligence')
  .version(version, '-v, --version', 'Display version number');

// ── init: Setup Wizard ──
program
  .command('init')
  .description('Interactive setup wizard for Orium')
  .option('-y, --yes', 'Use default configuration without prompts')
  .option('-o, --output <path>', 'Output directory for configuration', process.cwd())
  .action(async (options) => {
    if (options.yes) {
      console.log(`${C.cyan}Creating default configuration...${C.reset}`);
      const { generateConfig, writeConfig, writeEnvFile, generateEnvFile } = await import('../src/setup/generators.js');
      const config = generateConfig({
        useCase: 'personal',
        adapters: {},
        services: {
          image: true,
          audio: true,
          video: false,
          embedding: true,
          code: true,
          document: false,
          multimodal: false,
          music: false,
          rag: false,
          fineTuning: false,
        },
        routing: { strategy: 'fastest', failover: true, maxRetries: 3 },
        memory: { workingCapacity: 7, shortTermCapacity: 100, longTermBackend: 'sqlite' },
        skills: [],
      });
      const configPath = writeConfig(config, options.output);
      const envPath = writeEnvFile(generateEnvFile({
        useCase: 'personal',
        adapters: {},
        services: {} as any,
        routing: {} as any,
        memory: {} as any,
        skills: [],
      }), options.output);
      console.log(`${C.green}✓${C.reset} Config: ${C.cyan}${configPath}${C.reset}`);
      console.log(`${C.green}✓${C.reset} Env:    ${C.cyan}${envPath}${C.reset}`);
      return;
    }

    try {
      await runWizard(version);
    } catch (err) {
      console.error(`${C.red}Setup failed:${C.reset}`, err);
      process.exit(1);
    }
  });

// ── chat: Interactive Chat ──
program
  .command('chat')
  .description('Start interactive chat session')
  .option('-m, --model <model>', 'Model to use')
  .option('-a, --adapter <adapter>', 'Adapter to use')
  .option('-s, --system <prompt>', 'System prompt')
  .option('--skills <names>', 'Comma-separated skill names to activate')
  .action(async (options) => {
    const loader = new ConfigLoader();
    loader.loadDefaults();
    const config = loader.get();

    const registry = new AdapterRegistry();
    autoRegisterAdapters(registry, config);

    let adapterName = options.adapter;
    if (!adapterName) {
      const enabled = loader.getEnabledAdapters();
      if (enabled.length === 0) {
        console.error(`${C.red}No adapters configured. Run 'orium init' first.${C.reset}`);
        process.exit(1);
      }
      adapterName = enabled[0][0];
    }

    const adapter = registry.get(adapterName);
    if (!adapter) {
      console.error(`${C.red}Adapter not found: ${adapterName}${C.reset}`);
      process.exit(1);
    }

    // Setup skill registry
    const skillRegistry = new SkillRegistry();
    const env = process.env;
    if (env.TAVILY_API_KEY) skillRegistry.register(new TavilySkill({ apiKey: env.TAVILY_API_KEY }));
    if (env.SERPER_API_KEY) skillRegistry.register(new SerperSkill({ apiKey: env.SERPER_API_KEY }));
    if (env.ALPHA_VANTAGE_API_KEY) skillRegistry.register(new AlphaVantageSkill({ apiKey: env.ALPHA_VANTAGE_API_KEY }));
    if (env.FIRECRAWL_API_KEY) skillRegistry.register(new FirecrawlSkill({ apiKey: env.FIRECRAWL_API_KEY }));
    if (env.NOBANA_API_KEY) skillRegistry.register(new NobanaSkill({ apiKey: env.NOBANA_API_KEY }));
    skillRegistry.register(new EastMoneySkill());

    // Auto-activate skills
    if (options.skills) {
      const names = options.skills.split(',').map((s: string) => s.trim());
      for (const name of names) {
        try { await skillRegistry.activate(name); } catch { /* ignore */ }
      }
    } else {
      // Activate all by default
      for (const entry of skillRegistry.list()) {
        try { await skillRegistry.activate(entry.name); } catch { /* ignore */ }
      }
    }

    await startRepl({
      adapter,
      model: options.model,
      systemPrompt: options.system,
      adapterRegistry: registry,
      skillRegistry,
    });
  });

// ── config: Configuration Management ──
program
  .command('config')
  .description('Manage Orium configuration')
  .option('-g, --get <key>', 'Get configuration value')
  .option('-s, --set <key=value>', 'Set configuration value')
  .option('-l, --list', 'List all configuration')
  .action(async (options) => {
    const loader = new ConfigLoader();
    loader.loadDefaults();
    const config = loader.get();

    if (options.list) {
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    if (options.get) {
      const keys = options.get.split('.');
      let value: any = config;
      for (const key of keys) {
        value = value?.[key];
      }
      console.log(value !== undefined ? JSON.stringify(value, null, 2) : 'undefined');
      return;
    }

    if (options.set) {
      console.log(`${C.yellow}Config update not yet implemented in CLI.${C.reset}`);
      console.log(`${C.gray}Edit orium.yaml directly.${C.reset}`);
      return;
    }

    console.log(`${C.gray}Use --list, --get, or --set${C.reset}`);
  });

// ── doctor: Health Check ──
program
  .command('doctor')
  .description('Check system health and adapter connectivity')
  .action(async () => {
    console.log(`${C.cyan}${C.bold}Orium Doctor${C.reset} ${C.gray}v${version}${C.reset}\n`);

    const loader = new ConfigLoader();
    loader.loadDefaults();
    const config = loader.get();

    const registry = new AdapterRegistry();
    autoRegisterAdapters(registry, config);

    const enabled = loader.getEnabledAdapters();

    if (enabled.length === 0) {
      console.log(`${C.yellow}⚠ No adapters configured.${C.reset}`);
      console.log(`${C.gray}  Run 'orium init' to set up adapters.${C.reset}`);
      return;
    }

    console.log(`${C.bold}Checking ${enabled.length} configured adapters...${C.reset}\n`);

    let passed = 0;
    let failed = 0;

    for (const [name, adapterConfig] of enabled) {
      process.stdout.write(`  ${name.padEnd(20)} `);
      const adapter = registry.get(name);

      if (!adapter) {
        console.log(`${C.yellow}⚠ not registered${C.reset}`);
        continue;
      }

      try {
        const healthy = await adapter.healthCheck();
        if (healthy) {
          console.log(`${C.green}✓ healthy${C.reset}`);
          passed++;
        } else {
          console.log(`${C.red}✗ unhealthy${C.reset}`);
          failed++;
        }
      } catch (err) {
        console.log(`${C.red}✗ error${C.reset} ${C.gray}(${err})${C.reset}`);
        failed++;
      }
    }

    console.log(`\n${C.bold}Results:${C.reset} ${C.green}${passed} passed${C.reset}, ${C.red}${failed} failed${C.reset}`);

    if (failed > 0) {
      console.log(`\n${C.yellow}Troubleshooting:${C.reset}`);
      console.log(`  1. Check your API keys in .env.orium`);
      console.log(`  2. Verify network connectivity`);
      console.log(`  3. Run 'orium init' to reconfigure`);
    }
  });

// ── adapters: List Adapters ──
program
  .command('adapters')
  .description('List available adapters')
  .option('-e, --enabled', 'Show only enabled adapters')
  .action(async (options) => {
    const loader = new ConfigLoader();
    loader.loadDefaults();
    const config = loader.get();

    const registry = new AdapterRegistry();
    autoRegisterAdapters(registry, config);

    const all = registry.list();
    const enabled = new Set(loader.getEnabledAdapters().map(([name]) => name));

    console.log(`${C.bold}Available Adapters:${C.reset}\n`);

    for (const name of all) {
      const isEnabled = enabled.has(name);
      if (options.enabled && !isEnabled) continue;

      const status = isEnabled ? `${C.green}●${C.reset}` : `${C.gray}○${C.reset}`;
      console.log(`  ${status} ${name}`);
    }

    console.log(`\n${C.gray}${C.green}●${C.reset} enabled  ${C.gray}○${C.reset} disabled${C.reset}`);
  });

// ── serve: HTTP/WebSocket Server ──
program
  .command('serve')
  .description('Start HTTP and WebSocket server')
  .option('-p, --port <port>', 'HTTP port', '3000')
  .option('-w, --ws-port <port>', 'WebSocket port', '3001')
  .option('-k, --api-key <key>', 'API key for authentication')
  .option('-a, --adapter <adapter>', 'Default adapter')
  .action(async (options) => {
    const loader = new ConfigLoader();
    loader.loadDefaults();
    const config = loader.get();

    const registry = new AdapterRegistry();
    autoRegisterAdapters(registry, config);

    const enabled = loader.getEnabledAdapters();
    const defaultAdapter = options.adapter || (enabled.length > 0 ? enabled[0][0] : undefined);

    if (!defaultAdapter) {
      console.error(`${C.red}No adapters configured. Run 'orium init' first.${C.reset}`);
      process.exit(1);
    }

    // Setup skills
    const skillRegistry = new SkillRegistry();
    const env = process.env;
    if (env.TAVILY_API_KEY) skillRegistry.register(new TavilySkill({ apiKey: env.TAVILY_API_KEY }));
    if (env.SERPER_API_KEY) skillRegistry.register(new SerperSkill({ apiKey: env.SERPER_API_KEY }));
    if (env.ALPHA_VANTAGE_API_KEY) skillRegistry.register(new AlphaVantageSkill({ apiKey: env.ALPHA_VANTAGE_API_KEY }));
    if (env.FIRECRAWL_API_KEY) skillRegistry.register(new FirecrawlSkill({ apiKey: env.FIRECRAWL_API_KEY }));
    if (env.NOBANA_API_KEY) skillRegistry.register(new NobanaSkill({ apiKey: env.NOBANA_API_KEY }));
    skillRegistry.register(new EastMoneySkill());

    for (const entry of skillRegistry.list()) {
      try { await skillRegistry.activate(entry.name); } catch { /* ignore */ }
    }

    const httpPort = parseInt(options.port, 10);
    const wsPort = parseInt(options.wsPort, 10);

    const httpServer = new OriumServer({
      port: httpPort,
      adapterRegistry: registry,
      skillRegistry,
      defaultAdapter,
      apiKey: options.apiKey,
    });
    httpServer.start();

    const wsServer = new OriumWebSocketServer({
      port: wsPort,
      adapterRegistry: registry,
      skillRegistry,
      defaultAdapter,
      apiKey: options.apiKey,
    });
    wsServer.start();
  });

// Parse arguments
program.parse();
