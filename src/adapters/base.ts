/**
 * Orium - Model Adapter Base
 * Unified interface for all LLM providers.
 */

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  metadata?: Record<string, unknown>;
}

export interface CompletionRequest {
  messages: Message[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  stream?: boolean;
}

export interface CompletionResponse {
  id: string;
  content: string;
  toolCalls?: ToolCall[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export abstract class ModelAdapter {
  abstract readonly name: string;
  abstract readonly supportedModels: string[];

  abstract complete(request: CompletionRequest): Promise<CompletionResponse>;
  abstract stream(
    request: CompletionRequest,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResponse>;

  abstract healthCheck(): Promise<boolean>;
}

export class AdapterRegistry {
  private adapters: Map<string, ModelAdapter> = new Map();

  register(adapter: ModelAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  get(name: string): ModelAdapter | undefined {
    return this.adapters.get(name);
  }

  list(): string[] {
    return Array.from(this.adapters.keys());
  }
}

export const adapters = new AdapterRegistry();
