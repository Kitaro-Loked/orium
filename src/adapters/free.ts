/**
 * Orium - Free / 公益站 / 免费 API Adapter
 * Supports various free and public AI API endpoints.
 */

import { ModelAdapter, CompletionRequest, CompletionResponse } from './base';

export interface FreeConfig {
  name: string;
  baseUrl: string;
  apiKey?: string;
  models?: string[];
  rateLimit?: number; // requests per minute
}

export class FreeAdapter extends ModelAdapter {
  readonly name: string;
  readonly supportedModels: string[];

  private config: FreeConfig;
  private lastRequestTime = 0;

  constructor(config: FreeConfig) {
    super();
    this.name = config.name;
    this.config = config;
    this.supportedModels = config.models || [];
  }

  private async rateLimit(): Promise<void> {
    if (!this.config.rateLimit) return;
    const minInterval = 60000 / this.config.rateLimit;
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < minInterval) {
      await new Promise((r) => setTimeout(r, minInterval - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    await this.rateLimit();

    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`${this.name} error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];

    return {
      id: data.id || `${this.name}-${Date.now()}`,
      content: choice?.message?.content || choice?.text || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  }

  async stream(
    request: CompletionRequest,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResponse> {
    await this.rateLimit();

    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`${this.name} error: ${res.status} ${await res.text()}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    let fullContent = '';
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter((l) => l.trim().startsWith('data: '));

      for (const line of lines) {
        const json = line.replace('data: ', '');
        if (json === '[DONE]') continue;
        try {
          const parsed = JSON.parse(json);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          fullContent += delta;
          onChunk(delta);
        } catch {
          // ignore
        }
      }
    }

    return {
      id: `stream-${Date.now()}`,
      content: fullContent,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.baseUrl}/models`, {
        headers: this.getHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Pre-configured free API endpoints.
 * Note: These may change or become unavailable. Use at your own risk.
 */
export const freeFactories = {
  /** Generic free endpoint */
  create: (config: FreeConfig) => new FreeAdapter(config),

  /** Pollinations AI - free image & text generation */
  pollinations: () =>
    new FreeAdapter({
      name: 'pollinations',
      baseUrl: 'https://text.pollinations.ai/openai',
      models: ['openai', 'mistral', 'llama', 'claude', 'deepseek'],
    }),

  /** FreeGPT35 - free ChatGPT-3.5 access */
  freegpt35: () =>
    new FreeAdapter({
      name: 'freegpt35',
      baseUrl: 'https://chatgpt3.free2gpt.xyz/api',
      models: ['gpt-3.5-turbo'],
      rateLimit: 10,
    }),

  /** Liaobots - free multi-model access */
  liaobots: () =>
    new FreeAdapter({
      name: 'liaobots',
      baseUrl: 'https://liaobots.work/api',
      models: ['gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5-pro'],
      rateLimit: 5,
    }),

  /** DuckDuckGo AI Chat */
  duckduckgo: () =>
    new FreeAdapter({
      name: 'duckduckgo',
      baseUrl: 'https://duckduckgo.com/duckchat/v1',
      models: ['gpt-4o-mini', 'claude-3-haiku', 'llama-3.1-70b', 'mixtral-8x7b'],
    }),

  /** BlackBox AI */
  blackbox: () =>
    new FreeAdapter({
      name: 'blackbox',
      baseUrl: 'https://www.blackbox.ai/api/chat',
      models: ['blackbox'],
      rateLimit: 20,
    }),

  /** You.com AI (limited free) */
  you: () =>
    new FreeAdapter({
      name: 'you',
      baseUrl: 'https://you.com/api/chat',
      models: ['gpt-4o', 'claude-3-sonnet'],
    }),

  /** Perplexity Labs (free tier) */
  perplexityLabs: () =>
    new FreeAdapter({
      name: 'perplexity-labs',
      baseUrl: 'https://labs-api.perplexity.ai',
      models: ['llama-3.1-sonar-huge-128k-online'],
    }),

  /** HuggingFace Free Inference */
  huggingfaceFree: (apiKey?: string) =>
    new FreeAdapter({
      name: 'huggingface-free',
      baseUrl: 'https://api-inference.huggingface.co/models',
      apiKey,
      models: ['meta-llama/Llama-3.1-70B-Instruct', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
      rateLimit: 30,
    }),

  /** Groq Free Tier */
  groqFree: (apiKey: string) =>
    new FreeAdapter({
      name: 'groq-free',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey,
      models: ['llama-3.1-70b-versatile', 'mixtral-8x7b-32768'],
    }),

  /** Cohere Trial */
  cohereTrial: (apiKey: string) =>
    new FreeAdapter({
      name: 'cohere-trial',
      baseUrl: 'https://api.cohere.com/v2',
      apiKey,
      models: ['command-r', 'command-light'],
    }),

  /** AI21 Trial */
  ai21Trial: (apiKey: string) =>
    new FreeAdapter({
      name: 'ai21-trial',
      baseUrl: 'https://api.ai21.com/studio/v1',
      apiKey,
      models: ['jamba-1.5-mini'],
    }),

  /** Gemini Free Tier */
  geminiFree: (apiKey: string) =>
    new FreeAdapter({
      name: 'gemini-free',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey,
      models: ['gemini-1.5-flash', 'gemini-1.0-pro'],
    }),

  /** OpenRouter Free Models */
  openrouterFree: (apiKey: string) =>
    new FreeAdapter({
      name: 'openrouter-free',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey,
      models: ['meta-llama/llama-3.1-8b-instruct:free', 'nousresearch/hermes-3-llama-3.1-405b:free'],
    }),

  /** 免费公益站 - 自定义 */
  customFree: (name: string, baseUrl: string, apiKey?: string) =>
    new FreeAdapter({
      name,
      baseUrl: baseUrl.replace(/\/$/, ''),
      apiKey,
    }),
};
