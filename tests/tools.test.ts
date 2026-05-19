import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../src/tools/registry';

describe('ToolRegistry', () => {
  it('registers and executes a tool', async () => {
    const registry = new ToolRegistry();
    registry.register(
      {
        name: 'add',
        description: 'Add two numbers',
        parameters: [
          { name: 'a', type: 'number', description: 'First number', required: true },
          { name: 'b', type: 'number', description: 'Second number', required: true },
        ],
      },
      async (args) => (args.a as number) + (args.b as number)
    );

    const result = await registry.execute('add', { a: 2, b: 3 });
    expect(result).toBe(5);
  });

  it('exports MCP-compatible schema', () => {
    const registry = new ToolRegistry();
    registry.register(
      {
        name: 'greet',
        description: 'Greet someone',
        parameters: [
          { name: 'name', type: 'string', description: 'Name', required: true },
        ],
      },
      async (args) => `Hello, ${args.name}!`
    );

    const mcp = registry.toMCP();
    expect(mcp.length).toBe(1);
    expect(mcp[0]).toHaveProperty('type', 'function');
    expect(mcp[0]).toHaveProperty('function.name', 'greet');
  });

  it('throws for unknown tool', async () => {
    const registry = new ToolRegistry();
    await expect(registry.execute('missing', {})).rejects.toThrow('Tool not found');
  });
});
