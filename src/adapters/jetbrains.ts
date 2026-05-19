/**
 * Orium - JetBrains AI Assistant Adapter
 * Uses JetBrains AI service.
 */

import { ModelAdapter, CompletionRequest, CompletionResponse } from './base';

export class JetBrainsAdapter extends ModelAdapter {
  readonly name = 'jetbrains';
  readonly supportedModels = [
    'jb-gpt-4o',
    'jb-gpt-4',
    'jb-claude-3-5-sonnet',
    'jb-claude-3-opus',
    'jb-gemini-1.5-pro',
  ];

  private token: string;
  private baseUrl = 'https://api.app.jetbrains.ai';

  constructor(token: string) {
    super();
    this.token = token;
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'JetBrainsIDE/2024.1',
      'X-Client-Name': 'jetbrains-ai-assistant',
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: request.model || 'jb-gpt-4o',
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens || 4096,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`JetBrains error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];

    return {
      id: data.id || `jetbrains-${Date.now()}`,
      content: choice?.message?.content || '',
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
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: request.model || 'jb-gpt-4o',
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens || 4096,
        stream: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`JetBrains error: ${res.status} ${await res.text()}`);
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
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: this.getHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
