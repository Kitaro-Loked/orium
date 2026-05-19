/**
 * Orium - Azure OpenAI Adapter
 */

import { ModelAdapter, CompletionRequest, CompletionResponse } from './base';

export class AzureOpenAIAdapter extends ModelAdapter {
  readonly name = 'azure';
  readonly supportedModels = [
    'gpt-4o',
    'gpt-4',
    'gpt-35-turbo',
    'gpt-4o-mini',
  ];

  private apiKey: string;
  private endpoint: string;
  private apiVersion: string;

  constructor(apiKey: string, endpoint: string, apiVersion = '2024-06-01') {
    super();
    this.apiKey = apiKey;
    this.endpoint = endpoint.replace(/\/$/, '');
    this.apiVersion = apiVersion;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const deployment = request.model || 'gpt-4o';
    const url = `${this.endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${this.apiVersion}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        tools: request.tools,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Azure error: ${res.status} ${await res.text()}`);
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
    const deployment = request.model || 'gpt-4o';
    const url = `${this.endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${this.apiVersion}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Azure error: ${res.status} ${await res.text()}`);
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
    try {
      const url = `${this.endpoint}/openai/models?api-version=${this.apiVersion}`;
      const res = await fetch(url, {
        headers: { 'api-key': this.apiKey },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
