/**
 * Orium - Relay / 中转站 / Forwarding Adapter
 * Supports various Chinese and international relay/proxy services.
 */

import { ModelAdapter, CompletionRequest, CompletionResponse } from './base';

export interface RelayConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  authHeader?: string;
  authPrefix?: string;
  models?: string[];
  customHeaders?: Record<string, string>;
}

export class RelayAdapter extends ModelAdapter {
  readonly name: string;
  readonly supportedModels: string[];

  private config: RelayConfig;

  constructor(config: RelayConfig) {
    super();
    this.name = config.name;
    this.config = config;
    this.supportedModels = config.models || [];
  }

  private getHeaders(): Record<string, string> {
    const authHeader = this.config.authHeader || 'Authorization';
    const authPrefix = this.config.authPrefix || 'Bearer';

    return {
      [authHeader]: `${authPrefix} ${this.config.apiKey}`.trim(),
      'Content-Type': 'application/json',
      ...this.config.customHeaders,
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        tools: request.tools,
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
      toolCalls: choice?.message?.tool_calls?.map((tc: any) => ({
        id: tc.id,
        name: tc.function?.name || tc.name,
        arguments: typeof tc.function?.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function?.arguments || tc.arguments || {},
      })),
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
          const delta = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || '';
          fullContent += delta;
          onChunk(delta);
        } catch {
          // ignore malformed
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
 * Pre-configured relay factories for common Chinese relay services.
 */
export const relayFactories = {
  /** Generic relay - any OpenAI-compatible forwarding service */
  create: (config: RelayConfig) => new RelayAdapter(config),

  /** API2D - popular Chinese relay */
  api2d: (apiKey: string) =>
    new RelayAdapter({
      name: 'api2d',
      baseUrl: 'https://openai.api2d.net',
      apiKey,
    }),

  /** OhMyGPT */
  ohmygpt: (apiKey: string) =>
    new RelayAdapter({
      name: 'ohmygpt',
      baseUrl: 'https://aigptx.top/v1',
      apiKey,
    }),

  /** AIProxy */
  aiproxy: (apiKey: string) =>
    new RelayAdapter({
      name: 'aiproxy',
      baseUrl: 'https://api.aiproxy.io/v1',
      apiKey,
    }),

  /** CloseAI */
  closeai: (apiKey: string) =>
    new RelayAdapter({
      name: 'closeai',
      baseUrl: 'https://api.closeai-proxy.xyz/v1',
      apiKey,
    }),

  /** API2GPT */
  api2gpt: (apiKey: string) =>
    new RelayAdapter({
      name: 'api2gpt',
      baseUrl: 'https://api.api2gpt.com/v1',
      apiKey,
    }),

  /** AIGC2D */
  aigc2d: (apiKey: string) =>
    new RelayAdapter({
      name: 'aigc2d',
      baseUrl: 'https://api.aigc2d.com/v1',
      apiKey,
    }),

  /** OneAPI / NewAPI (open source relay platform) */
  oneapi: (baseUrl: string, apiKey: string) =>
    new RelayAdapter({
      name: 'oneapi',
      baseUrl: `${baseUrl.replace(/\/$/, '')}/v1`,
      apiKey,
    }),

  /** NewAPI (fork of OneAPI) */
  newapi: (baseUrl: string, apiKey: string) =>
    new RelayAdapter({
      name: 'newapi',
      baseUrl: `${baseUrl.replace(/\/$/, '')}/v1`,
      apiKey,
    }),

  /** VoAPI */
  voapi: (apiKey: string) =>
    new RelayAdapter({
      name: 'voapi',
      baseUrl: 'https://api.voapi.io/v1',
      apiKey,
    }),

  /** AIHub */
  aihub: (apiKey: string) =>
    new RelayAdapter({
      name: 'aihub',
      baseUrl: 'https://aihubmix.com/v1',
      apiKey,
    }),

  /** GPTAPI */
  gptapi: (apiKey: string) =>
    new RelayAdapter({
      name: 'gptapi',
      baseUrl: 'https://api.gptapi.us/v1',
      apiKey,
    }),

  /** OpenAI-SB */
  openaisb: (apiKey: string) =>
    new RelayAdapter({
      name: 'openaisb',
      baseUrl: 'https://api.openai-sb.com/v1',
      apiKey,
    }),

  /** AIKey */
  aikey: (apiKey: string) =>
    new RelayAdapter({
      name: 'aikey',
      baseUrl: 'https://api.aikey.one/v1',
      apiKey,
    }),

  /** GoAPI */
  goapi: (apiKey: string) =>
    new RelayAdapter({
      name: 'goapi',
      baseUrl: 'https://api.goapi.xyz/v1',
      apiKey,
    }),

  /** APIGPT */
  apigpt: (apiKey: string) =>
    new RelayAdapter({
      name: 'apigpt',
      baseUrl: 'https://api.apigpt.cn/v1',
      apiKey,
    }),

  /** WildCard */
  wildcard: (apiKey: string) =>
    new RelayAdapter({
      name: 'wildcard',
      baseUrl: 'https://api.wildcard.com/v1',
      apiKey,
    }),

  /** 自定义中转站 - Custom relay */
  custom: (name: string, baseUrl: string, apiKey: string) =>
    new RelayAdapter({
      name,
      baseUrl: baseUrl.replace(/\/$/, ''),
      apiKey,
    }),
};
