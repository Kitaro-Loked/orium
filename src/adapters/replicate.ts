/**
 * Orium - Replicate Adapter
 */

import { ModelAdapter, CompletionRequest, CompletionResponse } from './base';

export class ReplicateAdapter extends ModelAdapter {
  readonly name = 'replicate';
  readonly supportedModels = [
    'meta/meta-llama-3.1-405b-instruct',
    'meta/meta-llama-3-70b-instruct',
    'mistralai/mixtral-8x7b-instruct-v0.1',
    'anthropic/claude-3.5-sonnet',
  ];

  private apiKey: string;
  private baseUrl = 'https://api.replicate.com/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const version = request.model || 'meta/meta-llama-3.1-405b-instruct';
    const res = await fetch(`${this.baseUrl}/models/${version}/predictions`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          prompt: this.messagesToPrompt(request.messages),
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens || 4096,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Replicate error: ${res.status} ${await res.text()}`);
    }

    const prediction = await res.json();
    const output = await this.waitForPrediction(prediction.id);

    return {
      id: prediction.id,
      content: Array.isArray(output) ? output.join('') : String(output),
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  private messagesToPrompt(messages: any[]): string {
    return messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
  }

  private async waitForPrediction(id: string): Promise<any> {
    while (true) {
      const res = await fetch(`${this.baseUrl}/predictions/${id}`, {
        headers: { Authorization: `Token ${this.apiKey}` },
      });
      const data = await res.json();
      if (data.status === 'succeeded') return data.output;
      if (data.status === 'failed') throw new Error('Replicate prediction failed');
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  async stream(
    request: CompletionRequest,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResponse> {
    // Replicate streaming requires websockets - simplified here
    const response = await this.complete(request);
    onChunk(response.content as string);
    return response;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Token ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
