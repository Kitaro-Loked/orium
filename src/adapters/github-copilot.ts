/**
 * Orium - GitHub Copilot Adapter
 * Uses GitHub Copilot's internal API via Copilot token.
 */

import { ModelAdapter, CompletionRequest, CompletionResponse } from './base';

export class GitHubCopilotAdapter extends ModelAdapter {
  readonly name = 'github-copilot';
  readonly supportedModels = [
    'copilot-chat',
    'gpt-4o-copilot',
    'claude-sonnet-copilot',
  ];

  private githubToken: string;
  private copilotToken?: string;
  private baseUrl = 'https://api.githubcopilot.com';

  constructor(githubToken: string) {
    super();
    this.githubToken = githubToken;
  }

  private async getCopilotToken(): Promise<string> {
    if (this.copilotToken) return this.copilotToken;

    const res = await fetch('https://api.github.com/copilot_internal/v2/token', {
      headers: {
        Authorization: `token ${this.githubToken}`,
        'Editor-Version': 'vscode/1.85.0',
        'Editor-Plugin-Version': 'copilot-chat/0.11.0',
        'User-Agent': 'GitHubCopilotChat/0.11.0',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to get Copilot token: ${res.status}`);
    }

    const data = await res.json();
    this.copilotToken = data.token;
    return this.copilotToken!;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const token = await this.getCopilotToken();

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Copilot-Integration-Id': 'vscode-chat',
        'Editor-Version': 'vscode/1.85.0',
      },
      body: JSON.stringify({
        model: request.model || 'copilot-chat',
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens || 4096,
        stream: false,
        intent: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`GitHub Copilot error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const choice = data.choices[0];

    return {
      id: data.id,
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
    const token = await this.getCopilotToken();

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Copilot-Integration-Id': 'vscode-chat',
        'Editor-Version': 'vscode/1.85.0',
      },
      body: JSON.stringify({
        model: request.model || 'copilot-chat',
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens || 4096,
        stream: true,
        intent: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`GitHub Copilot error: ${res.status} ${await res.text()}`);
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
      const token = await this.getCopilotToken();
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
