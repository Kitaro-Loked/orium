/**
 * Orium - GitHub Models Adapter (models.inference.ai.azure.com)
 * Free tier available for GitHub users.
 */

import { ModelAdapter, CompletionRequest, CompletionResponse } from './base';

export class GitHubModelsAdapter extends ModelAdapter {
  readonly name = 'github-models';
  readonly supportedModels = [
    'gpt-4o',
    'gpt-4o-mini',
    'o1-mini',
    'o1-preview',
    'phi-4',
    'phi-3.5-moe-instruct',
    'phi-3-medium-instruct',
    'Mistral-large',
    'Mistral-small',
    'Meta-Llama-3.1-405B-Instruct',
    'Meta-Llama-3.1-70B-Instruct',
    'Meta-Llama-3.1-8B-Instruct',
    'AI21-Jamba-1.5-Large',
    'AI21-Jamba-1.5-Mini',
    'Cohere-command-r',
    'Cohere-command-r-plus',
    'DeepSeek-R1',
  ];

  private token: string;
  private baseUrl = 'https://models.inference.ai.azure.com';

  constructor(token: string) {
    super();
    this.token = token;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'gpt-4o',
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        tools: request.tools,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`GitHub Models error: ${res.status} ${await res.text()}`);
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
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'gpt-4o',
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`GitHub Models error: ${res.status} ${await res.text()}`);
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
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
