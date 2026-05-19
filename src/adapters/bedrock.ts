/**
 * Orium - Amazon Bedrock Adapter
 */

import { ModelAdapter, CompletionRequest, CompletionResponse, Message } from './base';

export class BedrockAdapter extends ModelAdapter {
  readonly name = 'bedrock';
  readonly supportedModels = [
    'anthropic.claude-3-5-sonnet-20241022-v2:0',
    'anthropic.claude-3-opus-20240229-v1:0',
    'anthropic.claude-3-sonnet-20240229-v1:0',
    'amazon.titan-text-premier-v1:0',
    'amazon.titan-text-express-v1',
    'meta.llama3-1-405b-instruct-v1:0',
    'meta.llama3-1-70b-instruct-v1:0',
    'meta.llama3-1-8b-instruct-v1:0',
    'mistral.mistral-large-2407-v1:0',
    'mistral.mixtral-8x7b-instruct-v0:1',
    'cohere.command-r-plus-v1:0',
    'ai21.jamba-1-5-large-v1:0',
  ];

  private accessKeyId: string;
  private secretAccessKey: string;
  private region: string;
  private baseUrl: string;

  constructor(accessKeyId: string, secretAccessKey: string, region = 'us-east-1') {
    super();
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.region = region;
    this.baseUrl = `https://bedrock-runtime.${region}.amazonaws.com`;
  }

  private async awsFetch(path: string, body: any): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const payload = JSON.stringify(body);
    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const amzDate = now.toISOString().replace(/[:\-]|\.[0-9]{3}/g, '').slice(0, 16) + 'Z';

    // Simplified AWS SigV4 - in production use aws4fetch or SDK
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Amz-Date': amzDate,
      'Host': new URL(this.baseUrl).host,
    };

    // For demo purposes, using Authorization header directly
    // Real implementation should compute AWS Signature V4
    return fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        Authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${dateStamp}/${this.region}/bedrock/aws4_request`,
      },
      body: payload,
    });
  }

  private convertMessages(messages: Message[]): any {
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
    const model = request.model || 'anthropic.claude-3-sonnet-20240229-v1:0';
    const { system, messages } = this.convertMessages(request.messages);

    const res = await this.awsFetch(`/model/${model}/invoke`, {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature ?? 0.7,
      system,
      messages,
    });

    if (!res.ok) {
      throw new Error(`Bedrock error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const content = data.content || [];
    const textContent = content.find((c: any) => c.type === 'text')?.text || '';

    return {
      id: `bedrock-${Date.now()}`,
      content: textContent,
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
    const model = request.model || 'anthropic.claude-3-sonnet-20240229-v1:0';
    const { system, messages } = this.convertMessages(request.messages);

    const res = await this.awsFetch(`/model/${model}/invoke-with-response-stream`, {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature ?? 0.7,
      system,
      messages,
    });

    if (!res.ok) {
      throw new Error(`Bedrock error: ${res.status} ${await res.text()}`);
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
          const text = parsed.contentBlockDelta?.delta?.text || '';
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
      const res = await this.awsFetch('/foundation-model-summaries', {});
      return res.ok;
    } catch {
      return false;
    }
  }
}
