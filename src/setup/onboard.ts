/**
 * Orium Onboard - Interactive Setup (inspired by OpenClaw onboard)
 * One-command setup: `orium onboard [--install-daemon]`
 */

import { execSync } from 'child_process';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { homedir, platform } from 'os';
import { resolve } from 'path';
import {
  printLogo,
  printSection,
  printSuccess,
  printWarning,
  printError,
  printInfo,
  ask,
  askSecret,
  select,
  multiselect,
  confirm,
  closePrompts,
  color as C,
} from './prompts';
import { ADAPTER_PRESETS, CATEGORY_LABELS, getAdaptersByCategory } from './adapters-preset';
import { generateConfig, generateEnvFile, writeConfig, writeEnvFile } from './generators';

export interface OnboardOptions {
  installDaemon?: boolean;
  skipWizard?: boolean;
  quick?: boolean;
}

export interface OnboardResult {
  configPath: string;
  envPath?: string;
  daemonInstalled?: boolean;
  adaptersConfigured: string[];
  skillsSelected: string[];
}

// ── Platform Detection ──
function getPlatform(): 'win32' | 'darwin' | 'linux' {
  const p = platform();
  if (p === 'win32') return 'win32';
  if (p === 'darwin') return 'darwin';
  return 'linux';
}

function printPlatformInfo(): void {
  const p = getPlatform();
  const icons: Record<string, string> = { win32: '⊞', darwin: '', linux: '🐧' };
  const names: Record<string, string> = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
  printInfo(`Detected platform: ${icons[p]} ${names[p]}`);
}

// ── Doctor / Diagnostics ──
export async function runDoctor(): Promise<boolean> {
  printSection('Orium Doctor — System Diagnostics');

  const checks: { name: string; pass: boolean; detail: string }[] = [];

  // Node version
  try {
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    checks.push({
      name: 'Node.js Runtime',
      pass: major >= 18,
      detail: `v${nodeVersion} ${major >= 18 ? '(✓)' : '(✗ need >= 18)'}`,
    });
  } catch {
    checks.push({ name: 'Node.js Runtime', pass: false, detail: 'Unable to detect' });
  }

  // Config exists
  const configPath = resolve(process.cwd(), 'orium.yaml');
  checks.push({
    name: 'Configuration File',
    pass: existsSync(configPath),
    detail: existsSync(configPath) ? `Found at ${configPath}` : 'Not found — run `orium onboard`',
  });

  // Env file
  const envPath = resolve(process.cwd(), '.env.orium');
  checks.push({
    name: 'Environment File',
    pass: existsSync(envPath),
    detail: existsSync(envPath) ? `Found at ${envPath}` : 'Not found',
  });

  // Workspace
  const workspacePath = resolve(homedir(), '.orium');
  checks.push({
    name: 'Workspace Directory',
    pass: existsSync(workspacePath),
    detail: existsSync(workspacePath) ? `Found at ${workspacePath}` : 'Not found — will be created',
  });

  // Display results
  let allPass = true;
  for (const check of checks) {
    const icon = check.pass ? `${C.green}✓${C.reset}` : `${C.yellow}⚠${C.reset}`;
    console.log(`  ${icon} ${C.bold}${check.name}${C.reset}: ${check.detail}`);
    if (!check.pass) allPass = false;
  }

  console.log('');
  if (allPass) {
    printSuccess('All checks passed! Your Orium environment is healthy.');
  } else {
    printWarning('Some checks failed. Run `orium onboard` to fix.');
  }

  return allPass;
}

// ── Daemon Installation ──
function installDaemon(): boolean {
  const p = getPlatform();
  printSection('Installing Gateway Daemon');

  try {
    if (p === 'darwin') {
      // macOS: launchd plist
      const plistPath = resolve(homedir(), 'Library/LaunchAgents/com.orium.gateway.plist');
      const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.orium.gateway</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${resolve(process.cwd(), 'dist/bin/orium.js')}</string>
    <string>server</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${resolve(homedir(), '.orium/logs/gateway.log')}</string>
  <key>StandardErrorPath</key>
  <string>${resolve(homedir(), '.orium/logs/gateway.error.log')}</string>
</dict>
</plist>`;
      mkdirSync(resolve(homedir(), 'Library/LaunchAgents'), { recursive: true });
      writeFileSync(plistPath, plist);
      execSync(`launchctl load ${plistPath}`);
      printSuccess('launchd service installed and started');
      return true;
    } else if (p === 'linux') {
      // Linux: systemd user service
      const systemdDir = resolve(homedir(), '.config/systemd/user');
      const servicePath = resolve(systemdDir, 'orium-gateway.service');
      const service = `[Unit]
Description=Orium Gateway
After=network.target

[Service]
Type=simple
ExecStart=${process.execPath} ${resolve(process.cwd(), 'dist/bin/orium.js')} server
Restart=always
RestartSec=5

[Install]
WantedBy=default.target`;
      mkdirSync(systemdDir, { recursive: true });
      writeFileSync(servicePath, service);
      execSync('systemctl --user daemon-reload');
      execSync('systemctl --user enable orium-gateway');
      execSync('systemctl --user start orium-gateway');
      printSuccess('systemd user service installed and started');
      return true;
    } else {
      // Windows: not supported natively, suggest Task Scheduler
      printWarning('Windows daemon installation not yet supported.');
      printInfo('To run Orium as a Windows service, consider using:');
      printInfo('  - nssm (Non-Sucking Service Manager)');
      printInfo('  - Windows Task Scheduler with "At startup" trigger');
      printInfo('  - Docker with restart policy');
      return false;
    }
  } catch (err) {
    printError(`Failed to install daemon: ${err}`);
    return false;
  }
}

// ── Workspace Setup ──
function setupWorkspace(): void {
  const workspacePath = resolve(homedir(), '.orium');
  const dirs = ['workspace', 'workspace/skills', 'workspace/agents', 'logs', 'cache'];

  for (const dir of dirs) {
    const fullPath = resolve(workspacePath, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
    }
  }

  // Create default AGENTS.md
  const agentsMdPath = resolve(workspacePath, 'workspace/AGENTS.md');
  if (!existsSync(agentsMdPath)) {
    writeFileSync(agentsMdPath, `# Orium Workspace

This is your Orium workspace directory.

## Structure

- \`workspace/skills/\` — Custom skills and tools
- \`workspace/agents/\` — Agent definitions
- \`logs/\` — Gateway logs
- \`cache/\` — Temporary cache

## Getting Started

1. Configure adapters in \`orium.yaml\`
2. Add API keys to \`.env.orium\`
3. Start chatting: \`orium chat\`
4. Launch Web UI: \`orium server\` then open http://localhost:3000/ui/v3/
`);
  }

  printSuccess(`Workspace ready at ${workspacePath}`);
}

// ── Quick Setup ──
async function quickSetup(): Promise<OnboardResult> {
  printSection('Quick Setup');
  printInfo('Configuring with recommended defaults...\n');

  const answers: any = {
    useCase: 'personal',
    adapters: {},
    services: { image: true, audio: true, embedding: true, code: true, document: false, multimodal: false, music: false, rag: false, fineTuning: false, video: false },
    routing: { strategy: 'fastest', failover: true, maxRetries: 3 },
    memory: { workingCapacity: 7, shortTermCapacity: 100, longTermBackend: 'sqlite' },
    skills: ['tavily', 'serper'],
  };

  // Auto-configure OpenAI if key exists in env
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    answers.adapters['openai'] = {
      enabled: true,
      apiKey: openaiKey,
      baseUrl: 'https://api.openai.com/v1',
      models: ['gpt-4o', 'gpt-4o-mini'],
      priority: 1,
    };
    printSuccess('OpenAI configured from environment');
  }

  // Generate config
  const config = generateConfig(answers);
  const configPath = writeConfig(config);
  const envContent = generateEnvFile(answers);
  const envPath = writeEnvFile(envContent);

  setupWorkspace();

  printSuccess('Quick setup complete!');
  printInfo('Run `orium doctor` to verify your setup');
  printInfo('Run `orium chat` to start chatting');

  return {
    configPath,
    envPath,
    adaptersConfigured: Object.keys(answers.adapters),
    skillsSelected: answers.skills,
  };
}

// ── Main Onboard ──
export async function runOnboard(version: string, options: OnboardOptions = {}): Promise<OnboardResult> {
  printLogo();
  console.log(`${C.bold}Welcome to Orium v${version}!${C.reset}\n`);
  printPlatformInfo();

  // Quick mode
  if (options.quick) {
    const result = await quickSetup();
    if (options.installDaemon) {
      result.daemonInstalled = installDaemon();
    }
    closePrompts();
    return result;
  }

  printInfo('This onboarding will guide you through setting up Orium step by step.');
  printInfo('You can skip any step or skip all remaining at any time.\n');

  const answers: any = {
    useCase: 'personal',
    adapters: {},
    services: {},
    routing: { strategy: 'fastest', failover: true, maxRetries: 3 },
    memory: { workingCapacity: 7, shortTermCapacity: 100, longTermBackend: 'sqlite' },
    skills: [],
  };

  // ── Step 1: Use Case ──
  printSection('Step 1: Use Case');
  const useCase = await select('What is your primary use case?', [
    { value: 'personal' as const, label: 'Personal Development', description: 'Individual projects, experiments, learning' },
    { value: 'enterprise' as const, label: 'Enterprise Deployment', description: 'Production systems, team collaboration' },
    { value: 'experiment' as const, label: 'Multi-Model Experiment', description: 'Benchmarking, model comparison, research' },
  ]);

  if (useCase !== 'skip') {
    answers.useCase = useCase;
    printSuccess(`Selected: ${useCase}`);
  }

  // ── Step 2: Adapter Configuration ──
  printSection('Step 2: AI Provider Configuration');
  printInfo('Enter API keys for the providers you want to use.');
  printInfo(`${C.yellow}[Enter]${C.reset} to skip a provider | ${C.yellow}[s]${C.reset} to skip all remaining\n`);

  let skipAll = false;
  const categories = ['global', 'china', 'open-source'] as const;

  for (const category of categories) {
    if (skipAll) break;

    const adapters = getAdaptersByCategory(category);
    if (adapters.length === 0) continue;

    console.log(`\n${C.bold}${CATEGORY_LABELS[category]}${C.reset}`);

    for (const preset of adapters) {
      if (skipAll) break;

      const result = preset.requiresKey
        ? await askSecret(`${preset.displayName} - ${preset.description}`)
        : await ask(`${preset.displayName} - ${preset.description}`, { defaultValue: preset.baseUrl });

      if (result === 'skip-all') {
        skipAll = true;
        printWarning('Skipping all remaining providers.');
        break;
      }

      if (result === 'skip') continue;

      const apiKey = typeof result === 'object' ? result.value : undefined;
      answers.adapters[preset.name] = {
        enabled: true,
        apiKey: apiKey || undefined,
        baseUrl: preset.baseUrl,
        models: preset.defaultModels,
        priority: category === 'global' ? 1 : category === 'china' ? 2 : 3,
      };

      printSuccess(`${preset.displayName} configured`);
    }
  }

  // ── Step 3: Service Layer ──
  printSection('Step 3: Service Layer');
  const services = await multiselect('Which AI services do you want to enable?', [
    { value: 'image', label: 'Image Generation (DALL-E, Midjourney, Stable Diffusion)' },
    { value: 'audio', label: 'Audio (Whisper, TTS, Speech Recognition)' },
    { value: 'video', label: 'Video Generation (Runway, Pika, Kling)' },
    { value: 'embedding', label: 'Embeddings (OpenAI, Cohere, Jina)' },
    { value: 'code', label: 'Code (Copilot, Codeium, Code Completion)' },
    { value: 'document', label: 'Document Processing (OCR, PDF Parsing)' },
    { value: 'multimodal', label: 'Multimodal (Vision, Audio Understanding)' },
    { value: 'music', label: 'Music Generation (Suno, Udio)' },
    { value: 'rag', label: 'RAG / Vector DB (Chroma, Pinecone, Qdrant)' },
    { value: 'fineTuning', label: 'Fine-tuning (OpenAI, Together, Fireworks)' },
  ], ['image', 'audio', 'embedding', 'code']);

  for (const svc of services) {
    answers.services[svc as keyof typeof answers.services] = true;
  }
  printSuccess(`${services.length} services enabled`);

  // ── Step 4: Routing Strategy ──
  printSection('Step 4: Routing Strategy');
  const strategy = await select('Choose default routing strategy:', [
    { value: 'fastest', label: 'Fastest Response', description: 'Route to the fastest available adapter' },
    { value: 'cheapest', label: 'Lowest Cost', description: 'Route to the cheapest option' },
    { value: 'round-robin', label: 'Round Robin', description: 'Distribute evenly across adapters' },
    { value: 'priority', label: 'Priority Order', description: 'Use priority-based fallback' },
    { value: 'random', label: 'Random', description: 'Random selection for load balancing' },
  ]);

  if (strategy !== 'skip') {
    answers.routing.strategy = strategy;
  }

  answers.routing.failover = await confirm('Enable automatic failover?', true);
  answers.routing.maxRetries = 3;

  // ── Step 5: External Skills ──
  printSection('Step 5: External Skills & APIs');
  const skillChoices = [
    { value: 'tavily', label: 'Tavily AI Search - Deep research & web search API' },
    { value: 'nobana', label: 'Nobana - Knowledge base & Agent platform' },
    { value: 'eastmoney', label: 'EastMoney (东方财富) - China A-share / fund / bond data' },
    { value: 'alphavantage', label: 'Alpha Vantage - Global stock / forex data' },
    { value: 'firecrawl', label: 'Firecrawl - Web scraping & content extraction' },
    { value: 'serper', label: 'Serper.dev - Google Search API' },
    { value: 'github', label: 'GitHub API - Code repository integration' },
  ];

  const selectedSkills = await multiselect('Select skills to enable:', skillChoices);
  answers.skills = selectedSkills;

  for (const skill of selectedSkills) {
    switch (skill) {
      case 'tavily': {
        const key = await askSecret('Tavily API Key');
        if (key !== 'skip' && key !== 'skip-all') printSuccess('Tavily configured');
        break;
      }
      case 'nobana': {
        const key = await askSecret('Nobana API Key');
        if (key !== 'skip' && key !== 'skip-all') printSuccess('Nobana configured');
        break;
      }
      case 'eastmoney': {
        const key = await askSecret('EastMoney API Key (optional)');
        if (key !== 'skip' && key !== 'skip-all') printSuccess('EastMoney configured');
        break;
      }
      case 'alphavantage': {
        const key = await askSecret('Alpha Vantage API Key');
        if (key !== 'skip' && key !== 'skip-all') printSuccess('Alpha Vantage configured');
        break;
      }
      case 'firecrawl': {
        const key = await askSecret('Firecrawl API Key');
        if (key !== 'skip' && key !== 'skip-all') printSuccess('Firecrawl configured');
        break;
      }
      case 'serper': {
        const key = await askSecret('Serper API Key');
        if (key !== 'skip' && key !== 'skip-all') printSuccess('Serper configured');
        break;
      }
      case 'github': {
        const key = await askSecret('GitHub Personal Access Token');
        if (key !== 'skip' && key !== 'skip-all') printSuccess('GitHub configured');
        break;
      }
    }
  }

  // ── Step 6: Generate Configuration ──
  printSection('Step 6: Generating Configuration');

  const config = generateConfig(answers);
  const configPath = writeConfig(config);
  printSuccess(`Config written to: ${C.cyan}${configPath}${C.reset}`);

  const envContent = generateEnvFile(answers);
  const envPath = writeEnvFile(envContent);
  printSuccess(`Environment template written to: ${C.cyan}${envPath}${C.reset}`);

  // Setup workspace
  setupWorkspace();

  // Install daemon if requested
  let daemonInstalled = false;
  if (options.installDaemon) {
    daemonInstalled = installDaemon();
  }

  // ── Done ──
  printSection('Onboarding Complete! 🎉');
  console.log(`\n${C.green}${C.bold}Your Orium environment is ready.${C.reset}\n`);

  const adapterCount = Object.keys(answers.adapters).length;
  console.log(`  ${C.bold}Adapters configured:${C.reset} ${adapterCount}`);
  console.log(`  ${C.bold}Services enabled:${C.reset} ${Object.entries(answers.services).filter(([, v]) => v).map(([k]) => k).join(', ')}`);
  console.log(`  ${C.bold}Skills selected:${C.reset} ${answers.skills.join(', ') || 'none'}`);
  console.log(`  ${C.bold}Routing strategy:${C.reset} ${answers.routing.strategy}`);
  if (daemonInstalled) {
    console.log(`  ${C.bold}Daemon:${C.reset} ${C.green}Installed & Running${C.reset}`);
  }

  console.log(`\n${C.bold}Next steps:${C.reset}`);
  console.log(`  1. Edit ${C.cyan}.env.orium${C.reset} to add your API keys`);
  console.log(`  2. Run ${C.cyan}orium doctor${C.reset} to verify connectivity`);
  console.log(`  3. Run ${C.cyan}orium chat${C.reset} to start chatting`);
  console.log(`  4. Run ${C.cyan}orium server${C.reset} to launch the Web UI`);
  console.log(`  5. Open ${C.cyan}http://localhost:3000/ui/v3/${C.reset} in your browser\n`);

  closePrompts();

  return {
    configPath,
    envPath,
    daemonInstalled,
    adaptersConfigured: Object.keys(answers.adapters),
    skillsSelected: answers.skills,
  };
}
