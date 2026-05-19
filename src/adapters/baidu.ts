/**
 * Orium - Baidu ERNIE (文心一言) Adapter
 */

import { ModelAdapter, CompletionRequest, CompletionResponse } from './base';

export class BaiduAdapter extends ModelAdapter {
  readonly name = 'baidu';
  readonly supportedModels = [
    'ernie-4.0-turbo-8k',
    'ernie-4.0-8k',
    'ernie-3.5-128k',
    'ernie-3.5-8k',
    'ernie-speed-128k',
    'ernie-speed-8k',
    'ernie-lite-8k',
  ];

  private apiKey: string;
  private secretKey: string;
  private accessToken?: string;
  private baseUrl = 'https://aip.baidubce.com';

  constructor(apiKey: string, secretKey: string) {
    super();
    this.apiKey = apiKey;
    this.secretKey = secretKey;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    const res = await fetch(
      `${this.baseUrl}/oauth/2.0/token?grant_type=client_credentials&client_id=${this.apiKey}&client_secret=${this.secretKey}`
    );
    const data = await res.json();
    this.accessToken = data.access_token;
    return this.accessToken!;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const token = await this.getAccessToken();
    const model = request.model || 'ernie-3.5-8k';

    const res = await fetch(
      `${this.baseUrl}/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/${model}?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_output_tokens: request.maxTokens,
          stream: false,
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Baidu error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();

    return {
      id: data.id || `baidu-${Date.now()}`,
      content: data.result || '',
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
    const token = await this.getAccessToken();
    const model = request.model || 'ernie-3.5-8k';

    const res = await fetch(
      `${this.baseUrl}/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/${model}?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_output_tokens: request.maxTokens,
          stream: true,
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Baidu error: ${res.status} ${await res.text()}`);
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
        if (!line.startsWith('data:')) continue;
        const json = line.replace('data:', '').trim();
        try {
          const parsed = JSON.parse(json);
          const text = parsed.result || '';
          fullContent += text;
          onChunk(text);
          if (parsed.is_end) break;
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
      await this.getAccessToken();
      return true;
    } catch {
      return false;
    }
  }
}
