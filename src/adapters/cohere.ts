/**
 * Orium - Cohere Adapter
 */

import { ModelAdapter, CompletionRequest, CompletionResponse, Message } from './base';

export class CohereAdapter extends ModelAdapter {
  readonly name = 'cohere';
  readonly supportedModels = [
    'command-r-plus',
    'command-r',
    'command',
    'command-light',
  ];

  private apiKey: string;
  private baseUrl = 'https://api.cohere.com/v2';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
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

    const body: any = {
      model: request.model || 'command-r',
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
    };

    if (system) body.preamble = system;
    if (request.tools) {
      body.tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const res = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Cohere error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const message = data.message;
    const text = message?.content?.[0]?.text || '';
    const toolCalls = message?.tool_calls?.map((tc: any) => ({
      id: tc.id || `tc-${Date.now()}`,
      name: tc.function?.name,
      arguments: tc.function?.arguments,
    }));

    return {
      id: data.generation_id || `cohere-${Date.now()}`,
      content: text,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      usage: {
        promptTokens: data.usage?.tokens?.input_tokens || 0,
        completionTokens: data.usage?.tokens?.output_tokens || 0,
        totalTokens:
          (data.usage?.tokens?.input_tokens || 0) +
          (data.usage?.tokens?.output_tokens || 0),
      },
    };
  }

  async stream(
    request: CompletionRequest,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResponse> {
    const { system, messages } = this.convertMessages(request.messages);

    const body: any = {
      model: request.model || 'command-r',
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
      stream: true,
    };

    if (system) body.preamble = system;

    const res = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Cohere error: ${res.status} ${await res.text()}`);
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
          if (parsed.type === 'content-delta') {
            const text = parsed.delta?.message?.content?.text || '';
            fullContent += text;
            onChunk(text);
          }
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
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
