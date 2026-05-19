/**
 * Orium - Chat Session Manager
 * Manages multi-turn conversations with any adapter.
 * Supports: tool calling, image input, multi-adapter switching.
 */

import type { ModelAdapter, CompletionRequest, Message, CompletionResponse, ToolDefinition, ToolCall } from '../adapters/base.js';
import type { SkillRegistry } from '../skills/base.js';

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  enableTools?: boolean;
}

export interface ChatMessage {
  id: string;
  role: Message['role'];
  content: string;
  timestamp: Date;
  model?: string;
  usage?: CompletionResponse['usage'];
  toolCalls?: ToolCall[];
  imageUrl?: string;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  result: unknown;
}

export class ChatSession {
  private messages: ChatMessage[] = [];
  private options: ChatOptions;
  private adapter: ModelAdapter;
  private skillRegistry?: SkillRegistry;
  private toolResults: ToolResult[] = [];

  constructor(adapter: ModelAdapter, options: ChatOptions = {}, skillRegistry?: SkillRegistry) {
    this.adapter = adapter;
    this.skillRegistry = skillRegistry;
    this.options = {
      temperature: 0.7,
      maxTokens: 4096,
      systemPrompt: 'You are a helpful assistant.',
      enableTools: !!skillRegistry,
      ...options,
    };

    if (this.options.systemPrompt) {
      this.messages.push({
        id: `system-${Date.now()}`,
        role: 'system',
        content: this.options.systemPrompt,
        timestamp: new Date(),
      });
    }
  }

  setAdapter(adapter: ModelAdapter, model?: string): void {
    this.adapter = adapter;
    if (model) this.options.model = model;
  }

  getAdapter(): ModelAdapter {
    return this.adapter;
  }

  getHistory(): ChatMessage[] {
    return [...this.messages];
  }

  clearHistory(keepSystem = true): void {
    if (keepSystem && this.messages[0]?.role === 'system') {
      this.messages = [this.messages[0]];
    } else {
      this.messages = [];
    }
    this.toolResults = [];
  }

  setSystemPrompt(prompt: string): void {
    const existingIdx = this.messages.findIndex((m) => m.role === 'system');
    const systemMsg: ChatMessage = {
      id: `system-${Date.now()}`,
      role: 'system',
      content: prompt,
      timestamp: new Date(),
    };

    if (existingIdx >= 0) {
      this.messages[existingIdx] = systemMsg;
    } else {
      this.messages.unshift(systemMsg);
    }
  }

  setSkillRegistry(registry: SkillRegistry): void {
    this.skillRegistry = registry;
    this.options.enableTools = true;
  }

  // ── Tool Support ──

  private getAvailableTools(): ToolDefinition[] | undefined {
    if (!this.options.enableTools || !this.skillRegistry) return undefined;
    const tools = this.skillRegistry.getAllTools();
    if (tools.length === 0) return undefined;

    return tools.map((t) => ({
      name: t.schema.name,
      description: t.schema.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          t.schema.parameters.map((p) => [
            p.name,
            { type: p.type, description: p.description, enum: p.enum },
          ])
        ),
        required: t.schema.parameters.filter((p) => p.required).map((p) => p.name),
      },
    }));
  }

  private async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
    if (!this.skillRegistry) {
      return { toolCallId: toolCall.id, name: toolCall.name, result: { error: 'No skill registry' } };
    }

    const tools = this.skillRegistry.getAllTools();
    const tool = tools.find((t) => t.schema.name === toolCall.name);

    if (!tool) {
      return { toolCallId: toolCall.id, name: toolCall.name, result: { error: `Tool not found: ${toolCall.name}` } };
    }

    try {
      const result = await tool.handler(toolCall.arguments);
      return { toolCallId: toolCall.id, name: toolCall.name, result };
    } catch (err) {
      return { toolCallId: toolCall.id, name: toolCall.name, result: { error: String(err) } };
    }
  }

  // ── Send with Tool Loop ──

  async send(message: string, imageUrl?: string): Promise<ChatMessage> {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date(),
      imageUrl,
    };
    this.messages.push(userMsg);

    return this._completeWithTools();
  }

  private async _completeWithTools(maxIterations = 5): Promise<ChatMessage> {
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      const request: CompletionRequest = {
        messages: this._buildMessages(),
        model: this.options.model,
        temperature: this.options.temperature,
        maxTokens: this.options.maxTokens,
        tools: this.getAvailableTools(),
      };

      const response = await this.adapter.complete(request);

      // Add assistant message
      const assistantMsg: ChatMessage = {
        id: response.id,
        role: 'assistant',
        content: response.content || '',
        timestamp: new Date(),
        model: this.options.model || this.adapter.name,
        usage: response.usage,
        toolCalls: response.toolCalls,
      };
      this.messages.push(assistantMsg);

      // If no tool calls, we're done
      if (!response.toolCalls || response.toolCalls.length === 0) {
        return assistantMsg;
      }

      // Execute tool calls
      const results: ToolResult[] = [];
      for (const toolCall of response.toolCalls) {
        const result = await this.executeToolCall(toolCall);
        results.push(result);
        this.toolResults.push(result);

        // Add tool result as a message
        this.messages.push({
          id: `tool-${toolCall.id}`,
          role: 'tool',
          content: JSON.stringify(result.result),
          timestamp: new Date(),
        });
      }

      // Loop back for another completion with tool results
    }

    // Max iterations reached
    return this.messages[this.messages.length - 1];
  }

  private _buildMessages(): Message[] {
    return this.messages.map((m) => {
      // Handle image input
      if (m.imageUrl) {
        return {
          role: m.role,
          content: [
            { type: 'text', text: m.content },
            { type: 'image_url', image_url: { url: m.imageUrl } },
          ],
        } as any;
      }
      return {
        role: m.role,
        content: m.content,
      };
    });
  }

  // ── Streaming ──

  async *stream(message: string, imageUrl?: string): AsyncGenerator<string, ChatMessage, unknown> {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date(),
      imageUrl,
    };
    this.messages.push(userMsg);

    const request: CompletionRequest = {
      messages: this._buildMessages(),
      model: this.options.model,
      temperature: this.options.temperature,
      maxTokens: this.options.maxTokens,
      stream: true,
    };

    let fullContent = '';

    await this.adapter.stream(request, (chunk: string) => {
      fullContent += chunk;
    });

    const assistantMsg: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: fullContent,
      timestamp: new Date(),
      model: this.options.model || this.adapter.name,
    };
    this.messages.push(assistantMsg);

    return assistantMsg;
  }

  // ── Utilities ──

  getTokenUsage(): { prompt: number; completion: number; total: number } {
    let prompt = 0;
    let completion = 0;

    for (const msg of this.messages) {
      if (msg.usage) {
        prompt += msg.usage.promptTokens;
        completion += msg.usage.completionTokens;
      }
    }

    return { prompt, completion, total: prompt + completion };
  }

  getToolResults(): ToolResult[] {
    return [...this.toolResults];
  }

  export(): { messages: ChatMessage[]; options: ChatOptions } {
    return {
      messages: this.getHistory(),
      options: { ...this.options },
    };
  }

  import(data: { messages: ChatMessage[]; options: ChatOptions }): void {
    this.messages = data.messages.map((m) => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));
    this.options = { ...data.options };
  }
}
