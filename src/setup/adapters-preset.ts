/**
 * Orium Setup Wizard - Adapter Presets
 * Pre-defined adapter configurations for popular providers.
 */

export interface AdapterPreset {
  name: string;
  displayName: string;
  description: string;
  envKey: string;
  baseUrl?: string;
  defaultModels: string[];
  category: 'global' | 'china' | 'open-source' | 'enterprise';
  requiresKey: boolean;
}

export const ADAPTER_PRESETS: AdapterPreset[] = [
  // Global Cloud
  {
    name: 'openai',
    displayName: 'OpenAI',
    description: 'GPT-4o, GPT-4o-mini, DALL-E, Whisper',
    envKey: 'OPENAI_API_KEY',
    defaultModels: ['gpt-4o', 'gpt-4o-mini'],
    category: 'global',
    requiresKey: true,
  },
  {
    name: 'anthropic',
    displayName: 'Anthropic',
    description: 'Claude 3.5 Sonnet, Claude 3 Opus',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModels: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'],
    category: 'global',
    requiresKey: true,
  },
  {
    name: 'gemini',
    displayName: 'Google Gemini',
    description: 'Gemini 2.0 Flash, Gemini 1.5 Pro',
    envKey: 'GEMINI_API_KEY',
    defaultModels: ['gemini-2.0-flash-exp', 'gemini-1.5-pro'],
    category: 'global',
    requiresKey: true,
  },
  {
    name: 'azure',
    displayName: 'Azure OpenAI',
    description: 'Enterprise OpenAI via Azure',
    envKey: 'AZURE_OPENAI_API_KEY',
    defaultModels: ['gpt-4o', 'gpt-4o-mini'],
    category: 'enterprise',
    requiresKey: true,
  },
  {
    name: 'groq',
    displayName: 'Groq',
    description: 'Ultra-fast inference (Llama, Mixtral)',
    envKey: 'GROQ_API_KEY',
    defaultModels: ['llama-3.1-70b-versatile', 'mixtral-8x7b-32768'],
    category: 'global',
    requiresKey: true,
  },
  {
    name: 'together',
    displayName: 'Together AI',
    description: 'Open-source models at scale',
    envKey: 'TOGETHER_API_KEY',
    defaultModels: ['meta-llama/Llama-3.1-70B-Instruct'],
    category: 'global',
    requiresKey: true,
  },
  {
    name: 'cohere',
    displayName: 'Cohere',
    description: 'Command R+, Embed models',
    envKey: 'COHERE_API_KEY',
    defaultModels: ['command-r-plus', 'command-r'],
    category: 'global',
    requiresKey: true,
  },
  {
    name: 'mistral',
    displayName: 'Mistral AI',
    description: 'Mistral Large, Codestral',
    envKey: 'MISTRAL_API_KEY',
    defaultModels: ['mistral-large-latest', 'codestral-latest'],
    category: 'global',
    requiresKey: true,
  },
  {
    name: 'openrouter',
    displayName: 'OpenRouter',
    description: 'Unified API for 100+ models',
    envKey: 'OPENROUTER_API_KEY',
    defaultModels: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet'],
    category: 'global',
    requiresKey: true,
  },
  {
    name: 'perplexity',
    displayName: 'Perplexity',
    description: 'AI search + LLM API',
    envKey: 'PERPLEXITY_API_KEY',
    defaultModels: ['sonar-pro', 'sonar'],
    category: 'global',
    requiresKey: true,
  },

  // China Providers
  {
    name: 'deepseek',
    displayName: 'DeepSeek',
    description: 'DeepSeek-V3, DeepSeek-Coder',
    envKey: 'DEEPSEEK_API_KEY',
    defaultModels: ['deepseek-chat', 'deepseek-coder'],
    category: 'china',
    requiresKey: true,
  },
  {
    name: 'qwen',
    displayName: '通义千问 (Qwen)',
    description: '阿里云大模型',
    envKey: 'DASHSCOPE_API_KEY',
    defaultModels: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
    category: 'china',
    requiresKey: true,
  },
  {
    name: 'zhipu',
    displayName: '智谱 AI (GLM)',
    description: 'ChatGLM, GLM-4',
    envKey: 'ZHIPU_API_KEY',
    defaultModels: ['glm-4', 'glm-4-plus'],
    category: 'china',
    requiresKey: true,
  },
  {
    name: 'moonshot',
    displayName: 'Moonshot (Kimi)',
    description: 'Kimi K1.5 长文本模型',
    envKey: 'MOONSHOT_API_KEY',
    defaultModels: ['moonshot-v1-128k', 'moonshot-v1-8k'],
    category: 'china',
    requiresKey: true,
  },
  {
    name: 'baidu',
    displayName: '百度文心一言',
    description: 'ERNIE 系列模型',
    envKey: 'BAIDU_API_KEY',
    defaultModels: ['ernie-bot-4', 'ernie-bot'],
    category: 'china',
    requiresKey: true,
  },
  {
    name: 'doubao',
    displayName: '豆包 (字节跳动)',
    description: '字节跳动云雀模型',
    envKey: 'DOUBAO_API_KEY',
    defaultModels: ['doubao-pro-128k', 'doubao-lite-128k'],
    category: 'china',
    requiresKey: true,
  },
  {
    name: 'hunyuan',
    displayName: '腾讯混元',
    description: '腾讯混元大模型',
    envKey: 'HUNYUAN_API_KEY',
    defaultModels: ['hunyuan-pro', 'hunyuan-standard'],
    category: 'china',
    requiresKey: true,
  },
  {
    name: 'siliconflow',
    displayName: 'SiliconFlow',
    description: '开源模型聚合平台',
    envKey: 'SILICONFLOW_API_KEY',
    defaultModels: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'],
    category: 'china',
    requiresKey: true,
  },

  // Open Source / Local
  {
    name: 'ollama',
    displayName: 'Ollama (Local)',
    description: '本地运行开源模型',
    envKey: 'OLLAMA_HOST',
    baseUrl: 'http://localhost:11434',
    defaultModels: ['llama3.1', 'qwen2.5', 'deepseek-coder-v2'],
    category: 'open-source',
    requiresKey: false,
  },
];

export const CATEGORY_LABELS: Record<string, string> = {
  global: '🌍 Global Cloud',
  china: '🇨🇳 China Providers',
  'open-source': '🔧 Open Source / Local',
  enterprise: '🏢 Enterprise',
};

export function getAdaptersByCategory(category: string): AdapterPreset[] {
  return ADAPTER_PRESETS.filter((a) => a.category === category);
}

export function getPresetByName(name: string): AdapterPreset | undefined {
  return ADAPTER_PRESETS.find((a) => a.name === name);
}
