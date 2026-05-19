/**
 * Orium - Generic OpenAI-Compatible Adapter
 * Works with ANY provider that follows the OpenAI API spec.
 */

import { ModelAdapter, CompletionRequest, CompletionResponse } from './base';

export class GenericAdapter extends ModelAdapter {
  readonly name: string;
  readonly supportedModels: string[];

  private apiKey: string;
  private baseUrl: string;

  /**
   * @param name - Adapter identifier
   * @param baseUrl - Base API URL (e.g., https://api.example.com/v1)
   * @param apiKey - API key
   * @param supportedModels - List of supported model IDs
   */
  constructor(name: string, baseUrl: string, apiKey: string, supportedModels: string[] = []) {
    super();
    this.name = name;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.supportedModels = supportedModels;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        tools: request.tools,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`${this.name} error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const choice = data.choices[0];

    return {
      id: data.id || `${this.name}-${Date.now()}`,
      content: choice?.message?.content || choice?.text || '',
      toolCalls: choice?.message?.tool_calls?.map((tc: any) => ({
        id: tc.id,
        name: tc.function?.name || tc.name,
        arguments: typeof tc.function?.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function?.arguments || tc.arguments || {},
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
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`${this.name} error: ${res.status} ${await res.text()}`);
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
          const delta = parsed.choices?.[0]?.delta?.content ||
            parsed.choices?.[0]?.text || '';
          fullContent += delta;
          onChunk(delta);
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
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Quick factory for common OpenAI-compatible providers.
 */
export const genericFactories = {
  /** Create adapter for any custom OpenAI-compatible endpoint */
  create: (name: string, baseUrl: string, apiKey: string, models?: string[]) =>
    new GenericAdapter(name, baseUrl, apiKey, models),

  /** LM Studio local server */
  lmstudio: (baseUrl = 'http://localhost:1234', apiKey = 'lm-studio') =>
    new GenericAdapter('lmstudio', `${baseUrl}/v1`, apiKey),

  /** Text Generation Inference (HuggingFace) */
  tgi: (baseUrl: string, apiKey: string) =>
    new GenericAdapter('tgi', baseUrl, apiKey),

  /** vLLM server */
  vllm: (baseUrl: string, apiKey = 'vllm') =>
    new GenericAdapter('vllm', baseUrl, apiKey),

  /** SGLang server */
  sglang: (baseUrl: string, apiKey = 'sglang') =>
    new GenericAdapter('sglang', baseUrl, apiKey),

  /** TabbyAPI */
  tabby: (baseUrl: string, apiKey: string) =>
    new GenericAdapter('tabby', baseUrl, apiKey),

  /** llama.cpp server */
  llamacpp: (baseUrl = 'http://localhost:8080') =>
    new GenericAdapter('llamacpp', `${baseUrl}/v1`, ''),

  /** kobold.cpp server */
  koboldcpp: (baseUrl = 'http://localhost:5001') =>
    new GenericAdapter('koboldcpp', `${baseUrl}/v1`, ''),

  /** ExLlamaV2 server */
  exllama: (baseUrl: string, apiKey = 'exllama') =>
    new GenericAdapter('exllama', baseUrl, apiKey),

  /** Anyscale */
  anyscale: (apiKey: string) =>
    new GenericAdapter('anyscale', 'https://api.endpoints.anyscale.com/v1', apiKey),

  /** Predibase */
  predibase: (apiKey: string) =>
    new GenericAdapter('predibase', 'https://serving.predibase.com/v1', apiKey),

  /** Baseten */
  baseten: (apiKey: string) =>
    new GenericAdapter('baseten', 'https://model-baseten-ksqfqjwmpcq6qryl.api.baseten.co/production/predict', apiKey),
};
