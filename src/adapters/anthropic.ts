/**
 * Orium - Anthropic Claude Adapter
 */

import { ModelAdapter, CompletionRequest, CompletionResponse, Message } from './base';

export class AnthropicAdapter extends ModelAdapter {
  readonly name = 'anthropic';
  readonly supportedModels = [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ];

  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://api.anthropic.com/v1') {
    super();
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private convertMessages(messages: Message[]): { system?: string; messages: any[] } {
    const systemMsg = messages.find((m) => m.role === 'system');
    const otherMsgs = messages.filter((m) => m.role !== 'system');
    return {
      system: systemMsg?.content,
      messages: otherMsgs.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const { system, messages } = this.convertMessages(request.messages);

    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'claude-3-5-sonnet-20241022',
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature ?? 0.7,
        system,
        messages,
        tools: request.tools?.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        })),
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const content = data.content || [];
    const textContent = content.find((c: any) => c.type === 'text')?.text || '';
    const toolUse = content.find((c: any) => c.type === 'tool_use');

    return {
      id: data.id,
      content: textContent,
      toolCalls: toolUse
        ? [
            {
              id: toolUse.id,
              name: toolUse.name,
              arguments: toolUse.input,
            },
          ]
        : undefined,
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens:
          (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    };
  }

  async stream(
    request: CompletionRequest,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResponse> {
    const { system, messages } = this.convertMessages(request.messages);

    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'claude-3-5-sonnet-20241022',
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature ?? 0.7,
        system,
        messages,
        stream: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic error: ${res.status} ${await res.text()}`);
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
          if (parsed.type === 'content_block_delta') {
            const text = parsed.delta?.text || '';
            fullContent += text;
            onChunk(text);
          }
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
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
