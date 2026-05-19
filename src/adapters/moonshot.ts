/**
 * Orium - Moonshot AI (Kimi) Adapter
 * Supports .cn domain with proper error handling.
 */

import { ModelAdapter, CompletionRequest, CompletionResponse, ToolCall } from './base';
import { safeFetch } from '../utils/http-client.js';
import { logger } from '../utils/logger.js';

interface MoonshotMessage {
  role: string;
  content: string;
}

interface MoonshotToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

interface MoonshotChoice {
  index: number;
  message: {
    role: string;
    content: string;
    tool_calls?: MoonshotToolCall[];
  };
  finish_reason: string;
}

interface MoonshotUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface MoonshotCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: MoonshotChoice[];
  usage: MoonshotUsage;
}

interface MoonshotStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

export class MoonshotAdapter extends ModelAdapter {
  readonly name = 'moonshot';
  readonly supportedModels = [
    'moonshot-v1-128k',
    'moonshot-v1-32k',
    'moonshot-v1-8k',
    'moonshot-v1-128k-vision-preview',
  ];

  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    super();
    this.apiKey = apiKey;
    // Default to .cn domain for Kimi
    this.baseUrl = baseUrl || 'https://api.moonshot.cn/v1';
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const body: Record<string, unknown> = {
      model: request.model || 'moonshot-v1-8k',
      messages: request.messages.map((m) => {
        const msg: Record<string, unknown> = {
          role: m.role,
          content: m.content,
        };
        if (m.tool_call_id) {
          msg.tool_call_id = m.tool_call_id;
        }
        if (m.tool_calls) {
          msg.tool_calls = m.tool_calls;
        }
        return msg;
      }),
      temperature: request.temperature ?? 0.7,
      stream: false,
    };

    // Only add optional fields if they are defined
    if (request.maxTokens !== undefined) {
      body.max_tokens = request.maxTokens;
    }
    // Moonshot only supports 'function' type tools, filter out empty/invalid ones
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    logger.debug('Moonshot complete request', { model: body.model, messageCount: request.messages.length });

    const { data } = await safeFetch<MoonshotCompletionResponse>(
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        adapterName: this.name,
        timeout: 60000,
      }
    );

    const choice = data.choices[0];
    const toolCalls = choice.message.tool_calls?.map((tc): ToolCall => ({
      id: tc.id,
      name: tc.function.name,
      arguments: this.safeParseJson(tc.function.arguments),
    }));

    return {
      id: data.id,
      content: choice.message.content || '',
      toolCalls,
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
    const body = {
      model: request.model || 'moonshot-v1-8k',
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
      stream: true,
    };

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Moonshot error: ${res.status} ${await res.text()}`);
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
          const parsed = JSON.parse(json) as MoonshotStreamChunk;
          const delta = parsed.choices[0]?.delta?.content || '';
          fullContent += delta;
          onChunk(delta);
        } catch {
          // ignore malformed chunks
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
      const { data } = await safeFetch<{ data: Array<{ id: string }> }>(
        `${this.baseUrl}/models`,
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          adapterName: this.name,
          timeout: 10000,
          maxRetries: 1,
        }
      );
      return Array.isArray(data.data);
    } catch (err) {
      logger.warn('Moonshot health check failed', err);
      return false;
    }
  }

  private safeParseJson(str: string): Record<string, unknown> {
    try {
      return JSON.parse(str) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
