/**
 * Orium - Cursor AI Adapter
 * Uses Cursor's internal API via access token.
 */

import { ModelAdapter, CompletionRequest, CompletionResponse } from './base';

export class CursorAdapter extends ModelAdapter {
  readonly name = 'cursor';
  readonly supportedModels = [
    'cursor-fast',
    'cursor-small',
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
    'gpt-4o',
    'gpt-4',
    'gemini-1.5-pro',
  ];

  private accessToken: string;
  private baseUrl = 'https://api2.cursor.sh';
  private machineId: string;
  private macMachineId: string;

  constructor(accessToken: string, machineId?: string, macMachineId?: string) {
    super();
    this.accessToken = accessToken;
    this.machineId = machineId || this.generateMachineId();
    this.macMachineId = macMachineId || this.machineId;
  }

  private generateMachineId(): string {
    return Array.from({ length: 32 }, () =>
      '0123456789abcdef'[Math.floor(Math.random() * 16)]
    ).join('');
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Cursor/0.42.0 (Windows NT 10.0; Win64; x64)',
      'X-Machine-Id': this.machineId,
      'X-Mac-Machine-Id': this.macMachineId,
      'Editor-Version': 'vscode/1.85.0',
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const res = await fetch(`${this.baseUrl}/aiserver.v1.AiService/StreamChat`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'cursor-fast',
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens || 4096,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Cursor error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const text = data.text || data.content || data.message?.content || '';

    return {
      id: data.id || `cursor-${Date.now()}`,
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
    const res = await fetch(`${this.baseUrl}/aiserver.v1.AiService/StreamChat`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: request.model || 'cursor-fast',
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens || 4096,
        stream: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Cursor error: ${res.status} ${await res.text()}`);
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
          const text = parsed.text || parsed.delta?.content || parsed.content || '';
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
