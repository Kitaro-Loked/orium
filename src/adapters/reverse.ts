/**
 * Orium - Reverse / 逆向 API Adapter
 * For services that require special handling, cookie-based auth, or non-standard APIs.
 */

import { ModelAdapter, CompletionRequest, CompletionResponse } from './base';

/**
 * Poe Reverse Adapter - uses internal API
 */
export class PoeReverseAdapter extends ModelAdapter {
  readonly name = 'poe-reverse';
  readonly supportedModels = [
    'ChatGPT',
    'GPT-4o',
    'Claude-3.5-Sonnet',
    'Claude-3-Opus',
    'Gemini-1.5-Pro',
    'Llama-3.1-405B',
    'Mistral-Large',
    'DALL-E-3',
  ];

  private poeToken: string;
  private baseUrl = 'https://poe.com';

  constructor(poeToken: string) {
    super();
    this.poeToken = poeToken;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    // Poe uses GraphQL - simplified implementation
    const formkey = await this.getFormkey();

    const res = await fetch(`${this.baseUrl}/api/gql_POST`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `p-b=${this.poeToken}`,
        'Poe-Formkey': formkey,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify({
        query: 'mutation sendMessageMutation($chatId: BigInt!, $message: String!, $bot: String!) {\n  messageCreate(\n    chatId: $chatId\n    message: $message\n    bot: $bot\n  ) {\n    message {\n      id\n      text\n    }\n  }\n}',
        variables: {
          bot: request.model || 'ChatGPT',
          chatId: 0,
          message: request.messages[request.messages.length - 1]?.content || '',
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Poe error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const text = data.data?.messageCreate?.message?.text || '';

    return {
      id: `poe-${Date.now()}`,
      content: text,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  private async getFormkey(): Promise<string> {
    const res = await fetch(this.baseUrl, {
      headers: {
        'Cookie': `p-b=${this.poeToken}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    const html = await res.text();
    const match = html.match(/window\.formkey\s*=\s*['"](.+?)['"]/);
    return match?.[1] || '';
  }

  async stream(
    request: CompletionRequest,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResponse> {
    const response = await this.complete(request);
    onChunk(response.content as string);
    return response;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(this.baseUrl, {
        headers: { 'Cookie': `p-b=${this.poeToken}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

/**
 * ChatGPT Reverse Adapter - uses access token
 */
export class ChatGPTReverseAdapter extends ModelAdapter {
  readonly name = 'chatgpt-reverse';
  readonly supportedModels = ['gpt-4o', 'gpt-4', 'gpt-4o-mini'];

  private accessToken: string;
  private baseUrl = 'https://chat.openai.com';

  constructor(accessToken: string) {
    super();
    this.accessToken = accessToken;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    // Create conversation
    const convRes = await fetch(`${this.baseUrl}/backend-api/conversation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify({
        action: 'next',
        messages: [
          {
            id: crypto.randomUUID?.() || `msg-${Date.now()}`,
            author: { role: 'user' },
            content: {
              content_type: 'text',
              parts: [request.messages[request.messages.length - 1]?.content || ''],
            },
          },
        ],
        model: request.model || 'gpt-4o',
        parent_message_id: crypto.randomUUID?.() || `parent-${Date.now()}`,
      }),
    });

    if (!convRes.ok) {
      throw new Error(`ChatGPT error: ${convRes.status} ${await convRes.text()}`);
    }

    const text = await convRes.text();
    const lines = text.split('\n').filter((l) => l.startsWith('data: '));
    let fullContent = '';

    for (const line of lines) {
      const json = line.replace('data: ', '');
      if (json === '[DONE]') break;
      try {
        const parsed = JSON.parse(json);
        const msg = parsed.message?.content?.parts?.[0] || '';
        if (msg) fullContent = msg;
      } catch {
        // ignore
      }
    }

    return {
      id: `chatgpt-${Date.now()}`,
      content: fullContent,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  async stream(
    request: CompletionRequest,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResponse> {
    const response = await this.complete(request);
    onChunk(response.content as string);
    return response;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/backend-api/me`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Claude Reverse Adapter - uses session key
 */
export class ClaudeReverseAdapter extends ModelAdapter {
  readonly name = 'claude-reverse';
  readonly supportedModels = ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'];

  private sessionKey: string;
  private baseUrl = 'https://claude.ai';

  constructor(sessionKey: string) {
    super();
    this.sessionKey = sessionKey;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const res = await fetch(`${this.baseUrl}/api/organizations/main/chat_conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `sessionKey=${this.sessionKey}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify({
        name: '',
        model: request.model || 'claude-3-5-sonnet-20241022',
      }),
    });

    if (!res.ok) {
      throw new Error(`Claude reverse error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const text = data.completion || '';

    return {
      id: data.uuid || `claude-${Date.now()}`,
      content: text,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  async stream(
    request: CompletionRequest,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResponse> {
    const response = await this.complete(request);
    onChunk(response.content as string);
    return response;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/organizations`, {
        headers: { Cookie: `sessionKey=${this.sessionKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Bing Copilot Reverse Adapter
 */
export class BingCopilotAdapter extends ModelAdapter {
  readonly name = 'bing-copilot';
  readonly supportedModels = ['Creative', 'Balanced', 'Precise'];

  private cookie: string;

  constructor(cookie: string) {
    super();
    this.cookie = cookie;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    // Bing uses WebSocket - simplified HTTP fallback
    const res = await fetch('https://www.bing.com/turing/conversation/create', {
      headers: {
        Cookie: this.cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!res.ok) {
      throw new Error(`Bing error: ${res.status}`);
    }

    const data = await res.json();

    return {
      id: data.conversationId || `bing-${Date.now()}`,
      content: 'Bing Copilot requires WebSocket implementation. Use bing-copilot with WebSocket support.',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  async stream(
    request: CompletionRequest,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResponse> {
    const response = await this.complete(request);
    onChunk(response.content as string);
    return response;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch('https://www.bing.com', {
        headers: { Cookie: this.cookie },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
