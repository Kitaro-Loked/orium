/**
 * Orium - Code Service (Completion, Generation, Review)
 * Unified interface for code-specific AI APIs.
 */

export interface CodeCompletionRequest {
  prefix: string;
  suffix?: string;
  language?: string; // e.g., "typescript", "python", "rust"
  model?: string;
  maxTokens?: number;
  temperature?: number;
  context?: string[]; // surrounding files/context
}

export interface CodeCompletionResponse {
  id: string;
  completion: string;
  alternatives?: string[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface CodeGenerationRequest {
  prompt: string;
  language?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  context?: string[];
}

export interface CodeReviewRequest {
  code: string;
  language?: string;
  model?: string;
  focus?: ('security' | 'performance' | 'style' | 'correctness' | 'maintainability')[];
}

export interface CodeReviewResponse {
  id: string;
  issues: Array<{
    severity: 'critical' | 'warning' | 'info';
    line?: number;
    column?: number;
    message: string;
    suggestion?: string;
    category: string;
  }>;
  summary: string;
}

export interface CodeExplanationRequest {
  code: string;
  language?: string;
  model?: string;
  detail?: 'brief' | 'detailed' | 'line-by-line';
}

export abstract class CodeService {
  abstract readonly name: string;
  abstract readonly supportedLanguages: string[];

  abstract complete(request: CodeCompletionRequest): Promise<CodeCompletionResponse>;
  abstract healthCheck(): Promise<boolean>;

  generate?(request: CodeGenerationRequest): Promise<CodeCompletionResponse> {
    throw new Error('Code generation not supported by this service');
  }

  review?(request: CodeReviewRequest): Promise<CodeReviewResponse> {
    throw new Error('Code review not supported by this service');
  }

  explain?(request: CodeExplanationRequest): Promise<{ explanation: string }> {
    throw new Error('Code explanation not supported by this service');
  }
}

// === GitHub Copilot (code-specific) ===

export class CopilotCodeService extends CodeService {
  readonly name = 'copilot-code';
  readonly supportedLanguages = ['*']; // All languages

  private token: string;
  private baseUrl = 'https://api.githubcopilot.com';

  constructor(token: string) {
    super();
    this.token = token;
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      'Editor-Version': 'vscode/1.85.0',
      'Copilot-Integration-Id': 'vscode-chat',
    };
  }

  async complete(request: CodeCompletionRequest): Promise<CodeCompletionResponse> {
    const res = await fetch(`${this.baseUrl}/copilot_internal/v2/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        prompt: request.prefix,
        suffix: request.suffix,
        max_tokens: request.maxTokens || 256,
        temperature: request.temperature ?? 0.2,
        language: request.language,
      }),
    });

    if (!res.ok) {
      throw new Error(`Copilot code error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: `copilot-code-${Date.now()}`,
      completion: data.choices?.[0]?.text || '',
      alternatives: data.choices?.slice(1)?.map((c: any) => c.text),
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
      },
    };
  }

  async generate(request: CodeGenerationRequest): Promise<CodeCompletionResponse> {
    const prompt = `Generate ${request.language || ''} code for: ${request.prompt}\n\n\`\`\`${request.language || ''}\n`;
    return this.complete({
      prefix: prompt,
      language: request.language,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
    });
  }

  async review(request: CodeReviewRequest): Promise<CodeReviewResponse> {
    const prompt = `Review the following ${request.language || ''} code for ${request.focus?.join(', ') || 'issues'}:\n\n\`\`\`\n${request.code}\n\`\`\``;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: 'copilot-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse review from text (simplified)
    return {
      id: `copilot-review-${Date.now()}`,
      issues: this.parseReviewIssues(content),
      summary: content.slice(0, 500),
    };
  }

  private parseReviewIssues(content: string): CodeReviewResponse['issues'] {
    const issues: CodeReviewResponse['issues'] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.includes('WARNING') || line.includes('⚠️')) {
        issues.push({ severity: 'warning', message: line.trim(), category: 'general' });
      } else if (line.includes('ERROR') || line.includes('❌')) {
        issues.push({ severity: 'critical', message: line.trim(), category: 'general' });
      } else if (line.includes('INFO') || line.includes('ℹ️')) {
        issues.push({ severity: 'info', message: line.trim(), category: 'general' });
      }
    }

    return issues;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: this.getHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Codeium (free code completion) ===

export class CodeiumCodeService extends CodeService {
  readonly name = 'codeium-code';
  readonly supportedLanguages = ['*'];

  private apiKey: string;
  private baseUrl = 'https://server.codeium.com';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async complete(request: CodeCompletionRequest): Promise<CodeCompletionResponse> {
    const res = await fetch(`${this.baseUrl}/exa.api_server_pb.ApiServerService/GetCompletions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document: { text: request.prefix + request.suffix || '' },
        editor_options: {
          tab_size: 2,
          insert_spaces: true,
        },
        language: request.language || 'typescript',
      }),
    });

    if (!res.ok) {
      throw new Error(`Codeium error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const completion = data.completionItems?.[0]?.completion?.text || '';

    return {
      id: `codeium-${Date.now()}`,
      completion,
      alternatives: data.completionItems?.slice(1)?.map((c: any) => c.completion?.text),
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Tabnine ===

export class TabnineService extends CodeService {
  readonly name = 'tabnine';
  readonly supportedLanguages = ['*'];

  private apiKey: string;
  private baseUrl = 'https://api.tabnine.com';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async complete(request: CodeCompletionRequest): Promise<CodeCompletionResponse> {
    const res = await fetch(`${this.baseUrl}/predict`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        before: request.prefix,
        after: request.suffix,
        filename: `file.${request.language || 'txt'}`,
        region_includes_beginning: true,
        region_includes_end: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Tabnine error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: `tabnine-${Date.now()}`,
      completion: data.results?.[0]?.new_prefix || '',
      alternatives: data.results?.slice(1)?.map((r: any) => r.new_prefix),
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Service Registry ===

export class CodeServiceRegistry {
  private services: Map<string, CodeService> = new Map();

  register(service: CodeService): void {
    this.services.set(service.name, service);
  }

  get(name: string): CodeService | undefined {
    return this.services.get(name);
  }

  list(): string[] {
    return Array.from(this.services.keys());
  }
}

export const codeServices = new CodeServiceRegistry();
