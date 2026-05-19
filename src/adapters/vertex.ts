/**
 * Orium - Google Vertex AI Adapter
 */

import { ModelAdapter, CompletionRequest, CompletionResponse, Message } from './base';

export class VertexAdapter extends ModelAdapter {
  readonly name = 'vertex';
  readonly supportedModels = [
    'gemini-2.0-flash-exp',
    'gemini-1.5-pro-002',
    'gemini-1.5-flash-002',
    'gemini-1.0-pro-002',
    'claude-3-5-sonnet-v2@20241022',
    'claude-3-opus@20240229',
    'llama3.1-405b-instruct-maas',
    'llama3.1-70b-instruct-maas',
  ];

  private apiKey: string;
  private projectId: string;
  private location: string;
  private baseUrl: string;

  constructor(apiKey: string, projectId: string, location = 'us-central1') {
    super();
    this.apiKey = apiKey;
    this.projectId = projectId;
    this.location = location;
    this.baseUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}`;
  }

  private convertMessages(messages: Message[]): { system?: string; contents: any[] } {
    const systemMsg = messages.find((m) => m.role === 'system');
    const otherMsgs = messages.filter((m) => m.role !== 'system');

    return {
      system: systemMsg?.content,
      contents: otherMsgs.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model || 'gemini-1.5-pro-002';
    const { system, contents } = this.convertMessages(request.messages);

    const body: any = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens || 8192,
      },
    };

    if (system) {
      body.systemInstruction = { parts: [{ text: system }] };
    }

    const res = await fetch(
      `${this.baseUrl}/publishers/google/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      throw new Error(`Vertex error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text || '';

    return {
      id: data.promptFeedback?.blockReason ? 'blocked' : `vertex-${Date.now()}`,
      content: text,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
      },
    };
  }

  async stream(
    request: CompletionRequest,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResponse> {
    const model = request.model || 'gemini-1.5-pro-002';
    const { system, contents } = this.convertMessages(request.messages);

    const body: any = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens || 8192,
      },
    };

    if (system) {
      body.systemInstruction = { parts: [{ text: system }] };
    }

    const res = await fetch(
      `${this.baseUrl}/publishers/google/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      throw new Error(`Vertex error: ${res.status} ${await res.text()}`);
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
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
      const res = await fetch(
        `${this.baseUrl}/models?key=${this.apiKey}`
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}
