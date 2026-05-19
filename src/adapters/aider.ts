/**
 * Orium - Aider Multi-Model Adapter
 * Aider supports switching between multiple models dynamically.
 */

import { ModelAdapter, CompletionRequest, CompletionResponse } from './base';

export class AiderAdapter extends ModelAdapter {
  readonly name = 'aider';
  readonly supportedModels = [
    'gpt-4o',
    'gpt-4o-mini',
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
    'deepseek-chat',
    'deepseek-coder',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'o1-mini',
    'o1-preview',
  ];

  private apiKeys: Map<string, string> = new Map();
  private baseUrls: Map<string, string> = new Map();
  private defaultModel = 'gpt-4o';

  constructor(config?: {
    openaiKey?: string;
    anthropicKey?: string;
    geminiKey?: string;
    deepseekKey?: string;
    openaiBaseUrl?: string;
    anthropicBaseUrl?: string;
    defaultModel?: string;
  }) {
    super();
    if (config?.openaiKey) this.apiKeys.set('openai', config.openaiKey);
    if (config?.anthropicKey) this.apiKeys.set('anthropic', config.anthropicKey);
    if (config?.geminiKey) this.apiKeys.set('gemini', config.geminiKey);
    if (config?.deepseekKey) this.apiKeys.set('deepseek', config.deepseekKey);
    if (config?.openaiBaseUrl) this.baseUrls.set('openai', config.openaiBaseUrl);
    if (config?.anthropicBaseUrl) this.baseUrls.set('anthropic', config.anthropicBaseUrl);
    if (config?.defaultModel) this.defaultModel = config.defaultModel;
  }

  private getProviderForModel(model: string): string {
    const lower = model.toLowerCase();
    if (lower.startsWith('gpt') || lower.startsWith('o1')) return 'openai';
    if (lower.startsWith('claude')) return 'anthropic';
    if (lower.startsWith('gemini')) return 'gemini';
    if (lower.startsWith('deepseek')) return 'deepseek';
    return 'openai';
  }

  private getHeaders(provider: string): Record<string, string> {
    const key = this.apiKeys.get(provider);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (key) {
      headers['Authorization'] = `Bearer ${key}`;
    }
    return headers;
  }

  private getBaseUrl(provider: string): string {
    const custom = this.baseUrls.get(provider);
    if (custom) return custom;

    switch (provider) {
      case 'openai':
        return 'https://api.openai.com/v1';
      case 'anthropic':
        return 'https://api.anthropic.com/v1';
      case 'gemini':
        return 'https://generativelanguage.googleapis.com/v1beta';
      case 'deepseek':
        return 'https://api.deepseek.com/v1';
      default:
        return 'https://api.openai.com/v1';
    }
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model || this.defaultModel;
    const provider = this.getProviderForModel(model);
    const baseUrl = this.getBaseUrl(provider);

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(provider),
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        tools: request.tools,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Aider/${provider} error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const choice = data.choices[0];

    return {
      id: data.id,
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls?.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
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
    const model = request.model || this.defaultModel;
    const provider = this.getProviderForModel(model);
    const baseUrl = this.getBaseUrl(provider);

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(provider),
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Aider/${provider} error: ${res.status} ${await res.text()}`);
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
          const delta = parsed.choices[0]?.delta?.content || '';
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
    for (const [provider, key] of this.apiKeys) {
      try {
        const baseUrl = this.getBaseUrl(provider);
        const res = await fetch(`${baseUrl}/models`, {
          headers: this.getHeaders(provider),
        });
        if (res.ok) return true;
      } catch {
        // try next
      }
    }
    return false;
  }
}
