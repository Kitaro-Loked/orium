/**
 * Orium - Ollama Local Model Adapter
 */

import { ModelAdapter, CompletionRequest, CompletionResponse, Message } from './base';

export class OllamaAdapter extends ModelAdapter {
  readonly name = 'ollama';
  readonly supportedModels: string[] = []; // Dynamic - any local model

  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:11434') {
    super();
    this.baseUrl = baseUrl;
  }

  private convertMessages(messages: Message[]): any {
    const systemMsg = messages.find((m) => m.role === 'system');
    const otherMsgs = messages.filter((m) => m.role !== 'system');

    return {
      system: systemMsg?.content,
      messages: otherMsgs.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const { system, messages } = this.convertMessages(request.messages);

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model || 'llama3.2',
        messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
        stream: false,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();

    return {
      id: `ollama-${Date.now()}`,
      content: data.message?.content || '',
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
    };
  }

  async stream(
    request: CompletionRequest,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResponse> {
    const { system, messages } = this.convertMessages(request.messages);

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model || 'llama3.2',
        messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
        stream: true,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    let fullContent = '';
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const text = parsed.message?.content || '';
          fullContent += text;
          onChunk(text);
          if (parsed.done) break;
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
      const res = await fetch(`${this.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      const data = await res.json();
      return data.models?.map((m: any) => m.name) || [];
    } catch {
      return [];
    }
  }

  async pullModel(model: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: false }),
    });
    if (!res.ok) {
      throw new Error(`Failed to pull model: ${await res.text()}`);
    }
  }
}
