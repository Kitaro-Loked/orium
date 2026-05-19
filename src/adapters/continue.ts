/**
 * Orium - Continue.dev Adapter
 * Open-source AI coding assistant with multi-provider support.
 */

import { ModelAdapter, CompletionRequest, CompletionResponse } from './base';

export class ContinueAdapter extends ModelAdapter {
  readonly name = 'continue';
  readonly supportedModels = [
    'continue-default',
    'local-ollama',
    'local-lmstudio',
  ];

  private configServerUrl?: string;
  private baseProvider?: string;
  private baseUrl: string;

  /**
   * @param config - Either a config server URL or a direct provider config
   */
  constructor(config?: { serverUrl?: string; provider?: string; baseUrl?: string }) {
    super();
    this.configServerUrl = config?.serverUrl;
    this.baseProvider = config?.provider;
    this.baseUrl = config?.baseUrl || 'http://localhost:65432';
  }

  private async getActiveConfig(): Promise<{ provider: string; baseUrl: string; apiKey?: string }> {
    if (this.configServerUrl) {
      const res = await fetch(`${this.configServerUrl}/config`);
      return await res.json();
    }
    return {
      provider: this.baseProvider || 'ollama',
      baseUrl: this.baseUrl,
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const config = await this.getActiveConfig();

    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: request.model || 'continue-default',
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Continue error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];

    return {
      id: data.id || `continue-${Date.now()}`,
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
    const config = await this.getActiveConfig();

    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: request.model || 'continue-default',
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Continue error: ${res.status} ${await res.text()}`);
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
      const res = await fetch(`${this.baseUrl}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
