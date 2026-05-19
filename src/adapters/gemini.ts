/**
 * Orium - Google Gemini Adapter
 */

import { ModelAdapter, CompletionRequest, CompletionResponse, Message } from './base';

export class GeminiAdapter extends ModelAdapter {
  readonly name = 'gemini';
  readonly supportedModels = [
    'gemini-2.0-flash-exp',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-1.0-pro',
  ];

  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  private convertMessages(messages: Message[]): { contents: any[]; systemInstruction?: any } {
    const systemMsg = messages.find((m) => m.role === 'system');
    const otherMsgs = messages.filter((m) => m.role !== 'system');

    const result: any = {
      contents: otherMsgs.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    };

    if (systemMsg) {
      result.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }

    return result;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model || 'gemini-1.5-flash';
    const { contents, systemInstruction } = this.convertMessages(request.messages);

    const body: any = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens || 8192,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    const res = await fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      throw new Error(`Gemini error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text || '';

    return {
      id: data.promptFeedback?.blockReason ? 'blocked' : `gemini-${Date.now()}`,
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
    const model = request.model || 'gemini-1.5-flash';
    const { contents, systemInstruction } = this.convertMessages(request.messages);

    const body: any = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens || 8192,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    const res = await fetch(
      `${this.baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      throw new Error(`Gemini error: ${res.status} ${await res.text()}`);
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
      const res = await fetch(
        `${this.baseUrl}/models?key=${this.apiKey}&pageSize=1`
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}
