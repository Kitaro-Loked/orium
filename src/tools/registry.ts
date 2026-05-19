/**
 * Orium - Tool Registry
 * Universal tool system. MCP-compatible.
 */

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  enum?: unknown[];
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

export interface RegisteredTool {
  schema: ToolSchema;
  handler: ToolHandler;
}

export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  register(schema: ToolSchema, handler: ToolHandler): void {
    this.tools.set(schema.name, { schema, handler });
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  list(): ToolSchema[] {
    return Array.from(this.tools.values()).map((t) => t.schema);
  }

  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool not found: ${name}`);
    return tool.handler(args);
  }

  // Export as MCP-compatible schema
  toMCP(): Record<string, unknown>[] {
    return this.list().map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            t.parameters.map((p) => [
              p.name,
              { type: p.type, description: p.description, enum: p.enum },
            ])
          ),
          required: t.parameters.filter((p) => p.required).map((p) => p.name),
        },
      },
    }));
  }
}

export const tools = new ToolRegistry();
