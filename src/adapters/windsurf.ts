/**
 * Orium - Windsurf (Codeium) Adapter
 * Uses Codeium's API via Windsurf extension token.
 */

import { ModelAdapter, CompletionRequest, CompletionResponse } from './base';

export class WindsurfAdapter extends ModelAdapter {
  readonly name = 'windsurf';
  readonly supportedModels = [
    'windsurf-default',
    'gpt-4o',
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
    'gemini-1.5-pro',
  ];

  private apiKey: string;
  private baseUrl = 'https://server.codeium.com';
  private ideVersion = '1.85.0';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': `Windsurf/${this.ideVersion}`,
      'X-Client-Name': 'windsurf',
      'X-Client-Version': this.ideVersion,
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const res = await fetch(`${this.baseUrl}/exa.api_server_pb.ApiServerService/GetChatMessage`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: request.model || 'windsurf-default',
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens || 4096,
        stream: false,
        metadata: {
          ide: 'windsurf',
          ide_version: this.ideVersion,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Windsurf error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const text = data.text || data.content || data.message?.content || '';

    return {
      id: data.id || `windsurf-${Date.now()}`,
      content: text,
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
    const res = await fetch(`${this.baseUrl}/exa.api_server_pb.ApiServerService/StreamChatMessage`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: request.model || 'windsurf-default',
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens || 4096,
        stream: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Windsurf error: ${res.status} ${await res.text()}`);
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
          const text = parsed.text || parsed.delta?.content || '';
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
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: this.getHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
