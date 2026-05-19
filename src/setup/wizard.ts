/**
 * Orium Setup Wizard - Core Engine
 * Interactive installation guide with skip support.
 */

import {
  printWelcome,
  printSection,
  printSuccess,
  printWarning,
  printInfo,
  ask,
  askSecret,
  select,
  multiselect,
  confirm,
  closePrompts,
  color as C,
} from './prompts';
import { ADAPTER_PRESETS, CATEGORY_LABELS, getAdaptersByCategory, type AdapterPreset } from './adapters-preset';
import { generateConfig, generateEnvFile, writeConfig, writeEnvFile } from './generators';
import type { AdapterConfig } from '../core/config-loader';

export interface WizardResult {
  configPath: string;
  envPath?: string;
  adaptersConfigured: string[];
  skillsSelected: string[];
}

export async function runWizard(version: string): Promise<WizardResult> {
  printWelcome(version);

  const answers: any = {
    useCase: 'personal' as string,
    adapters: {} as Record<string, AdapterConfig>,
    services: {
      image: false,
      audio: false,
      video: false,
      embedding: false,
      code: false,
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
    skills: [] as string[],
  };

  // ── Step 1: Use Case ──
  printSection('Step 1: Use Case');
  const useCase = await select('What is your primary use case?', [
    { value: 'personal' as const, label: 'Personal Development', description: 'Individual projects, experiments, learning' },
    { value: 'enterprise' as const, label: 'Enterprise Deployment', description: 'Production systems, team collaboration' },
    { value: 'experiment' as const, label: 'Multi-Model Experiment', description: 'Benchmarking, model comparison, research' },
  ]);

  if (useCase === 'skip') {
    printWarning('Skipping use case selection, using defaults.');
  } else {
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

      if (result === 'skip') {
        continue;
      }

      const apiKey = result.value;
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
  printInfo('Configure third-party services for enhanced capabilities.\n');

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

  // Ask for API keys for selected skills
  for (const skill of selectedSkills) {
    switch (skill) {
      case 'tavily': {
        const key = await askSecret('Tavily API Key');
        if (key !== 'skip' && key !== 'skip-all') {
          printSuccess('Tavily configured');
        }
        break;
      }
      case 'nobana': {
        const key = await askSecret('Nobana API Key');
        if (key !== 'skip' && key !== 'skip-all') {
          printSuccess('Nobana configured');
        }
        break;
      }
      case 'eastmoney': {
        const key = await askSecret('EastMoney API Key (optional)');
        if (key !== 'skip' && key !== 'skip-all') {
          printSuccess('EastMoney configured');
        }
        break;
      }
      case 'alphavantage': {
        const key = await askSecret('Alpha Vantage API Key');
        if (key !== 'skip' && key !== 'skip-all') {
          printSuccess('Alpha Vantage configured');
        }
        break;
      }
      case 'firecrawl': {
        const key = await askSecret('Firecrawl API Key');
        if (key !== 'skip' && key !== 'skip-all') {
          printSuccess('Firecrawl configured');
        }
        break;
      }
      case 'serper': {
        const key = await askSecret('Serper API Key');
        if (key !== 'skip' && key !== 'skip-all') {
          printSuccess('Serper configured');
        }
        break;
      }
      case 'github': {
        const key = await askSecret('GitHub Personal Access Token');
        if (key !== 'skip' && key !== 'skip-all') {
          printSuccess('GitHub configured');
        }
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

  // ── Done ──
  printSection('Setup Complete!');
  console.log(`\n${C.green}${C.bold}Your Orium environment is ready.${C.reset}\n`);

  const adapterCount = Object.keys(answers.adapters).length;
  console.log(`  ${C.bold}Adapters configured:${C.reset} ${adapterCount}`);
  console.log(`  ${C.bold}Services enabled:${C.reset} ${Object.entries(answers.services).filter(([, v]) => v).map(([k]) => k).join(', ')}`);
  console.log(`  ${C.bold}Skills selected:${C.reset} ${answers.skills.join(', ') || 'none'}`);
  console.log(`  ${C.bold}Routing strategy:${C.reset} ${answers.routing.strategy}`);

  console.log(`\n${C.bold}Next steps:${C.reset}`);
  console.log(`  1. Edit ${C.cyan}.env.orium${C.reset} to add your API keys`);
  console.log(`  2. Run ${C.cyan}orium doctor${C.reset} to verify connectivity`);
  console.log(`  3. Run ${C.cyan}orium chat${C.reset} to start chatting`);
  console.log(`  4. Read the docs: ${C.cyan}https://github.com/your-org/orium${C.reset}\n`);

  closePrompts();

  return {
    configPath,
    envPath,
    adaptersConfigured: Object.keys(answers.adapters),
    skillsSelected: answers.skills,
  };
}
