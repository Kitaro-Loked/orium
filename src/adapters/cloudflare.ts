/**
 * Orium - Cloudflare Workers AI Adapter
 */

import { ModelAdapter, CompletionRequest, CompletionResponse } from './base';

export class CloudflareAdapter extends ModelAdapter {
  readonly name = 'cloudflare';
  readonly supportedModels = [
    '@cf/meta/llama-3.1-70b-instruct',
    '@cf/meta/llama-3.1-8b-instruct',
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    '@cf/mistral/mistral-7b-instruct-v0.1',
    '@cf/deepseek-ai/deepseek-math-7b-instruct',
    '@cf/qwen/qwen1.5-14b-chat-awq',
    '@cf/google/gemma-7b-it',
  ];

  private apiToken: string;
  private accountId: string;
  private baseUrl: string;

  constructor(apiToken: string, accountId: string) {
    super();
    this.apiToken = apiToken;
    this.accountId = accountId;
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run`;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model || '@cf/meta/llama-3.1-70b-instruct';

    const res = await fetch(`${this.baseUrl}/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
      }),
    });

    if (!res.ok) {
      throw new Error(`Cloudflare error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const result = data.result;

    return {
      id: `cf-${Date.now()}`,
      content: result.response || '',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    };
  }

  async stream(
    request: CompletionRequest,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResponse> {
    const model = request.model || '@cf/meta/llama-3.1-70b-instruct';

    const res = await fetch(`${this.baseUrl}/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Cloudflare error: ${res.status} ${await res.text()}`);
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
        try {
          const parsed = JSON.parse(json);
          const text = parsed.response || '';
          fullContent += text;
          onChunk(text);
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
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/models/search`,
        {
          headers: { Authorization: `Bearer ${this.apiToken}` },
        }
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}
