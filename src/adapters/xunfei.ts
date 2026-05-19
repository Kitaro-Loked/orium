/**
 * Orium - Xunfei Spark (讯飞星火) Adapter
 */

import { ModelAdapter, CompletionRequest, CompletionResponse } from './base';

export class XunfeiAdapter extends ModelAdapter {
  readonly name = 'xunfei';
  readonly supportedModels = [
    'generalv4',
    'generalv3.5',
    'generalv3',
    'generalv2',
  ];

  private appId: string;
  private apiKey: string;
  private apiSecret: string;
  private baseUrl = 'wss://spark-api.xf-yun.com';

  constructor(appId: string, apiKey: string, apiSecret: string) {
    super();
    this.appId = appId;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  // Xunfei uses WebSocket - simplified HTTP fallback here
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const domain = request.model || 'generalv4';
    const res = await fetch(`https://spark-api-open.xf-yun.com/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: domain,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Xunfei error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const choice = data.choices[0];

    return {
      id: data.id || `xunfei-${Date.now()}`,
      content: choice.message.content || '',
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
    const res = await fetch(`https://spark-api-open.xf-yun.com/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'generalv4',
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Xunfei error: ${res.status} ${await res.text()}`);
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
      const res = await fetch(`https://spark-api-open.xf-yun.com/v1/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
