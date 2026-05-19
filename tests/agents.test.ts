import { describe, it, expect, vi } from 'vitest';
import { AgentTeam, type AgentDefinition, type AgentTask } from '../src/agents/system';
import type { ModelAdapter, CompletionRequest, CompletionResponse } from '../src/adapters/base';

const createMockAdapter = (responseContent: string): ModelAdapter => ({
  name: 'mock',
  supportedModels: ['mock-model'],
  complete: vi.fn(async (_req: CompletionRequest): Promise<CompletionResponse> => ({
    id: 'resp-1',
    content: responseContent,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  })),
  stream: vi.fn(),
  healthCheck: vi.fn(async () => true),
});

describe('AgentTeam', () => {
  it('adds and lists agents', () => {
    const team = new AgentTeam('sequential');
    const agent: AgentDefinition = {
      id: 'a1',
      name: 'Writer',
      role: 'Content Writer',
      goal: 'Write content',
      backstory: 'An experienced writer.',
      tools: [],
      model: 'mock-model',
      adapter: createMockAdapter('Hello'),
    };

    team.addAgent(agent);
    expect(team.listAgents().length).toBe(1);
    expect(team.getAgent('a1')?.name).toBe('Writer');
  });

  it('removes an agent', () => {
    const team = new AgentTeam('sequential');
    const agent: AgentDefinition = {
      id: 'a1',
      name: 'Writer',
      role: 'Content Writer',
      goal: 'Write content',
      backstory: 'An experienced writer.',
      tools: [],
      model: 'mock-model',
      adapter: createMockAdapter('Hello'),
    };

    team.addAgent(agent);
    team.removeAgent('a1');
    expect(team.listAgents().length).toBe(0);
  });

  it('executes tasks sequentially', async () => {
    const team = new AgentTeam('sequential');
    const agent: AgentDefinition = {
      id: 'a1',
      name: 'Writer',
      role: 'Content Writer',
      goal: 'Write content',
      backstory: 'An experienced writer.',
      tools: [],
      model: 'mock-model',
      adapter: createMockAdapter('Done'),
    };

    team.addAgent(agent);
    const tasks: AgentTask[] = [
      { id: 't1', description: 'Task 1' },
      { id: 't2', description: 'Task 2' },
    ];

    const results = await team.execute(tasks);
    expect(results.length).toBe(2);
    expect(results[0].success).toBe(true);
    expect(results[0].output).toBe('Done');
    expect(results[1].success).toBe(true);
  });

  it('executes tasks in parallel', async () => {
    const team = new AgentTeam('parallel');
    const agent: AgentDefinition = {
      id: 'a1',
      name: 'Worker',
      role: 'Worker',
      goal: 'Work',
      backstory: 'A worker.',
      tools: [],
      model: 'mock-model',
      adapter: createMockAdapter('Parallel'),
    };

    team.addAgent(agent);
    const tasks: AgentTask[] = [
      { id: 't1', description: 'Task 1' },
      { id: 't2', description: 'Task 2' },
    ];

    const results = await team.execute(tasks);
    expect(results.length).toBe(2);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it('delegates tasks hierarchically', async () => {
    const team = new AgentTeam('hierarchical', 'manager');
    const manager: AgentDefinition = {
      id: 'manager',
      name: 'Manager',
      role: 'Manager',
      goal: 'Manage',
      backstory: 'A manager.',
      tools: [],
      model: 'mock-model',
      adapter: createMockAdapter(JSON.stringify([{ taskId: 't1', assignedAgentId: 'worker', reasoning: 'Best fit' }])),
    };
    const worker: AgentDefinition = {
      id: 'worker',
      name: 'Worker',
      role: 'Worker',
      goal: 'Work',
      backstory: 'A worker.',
      tools: [],
      model: 'mock-model',
      adapter: createMockAdapter('Worker result'),
    };

    team.addAgent(manager);
    team.addAgent(worker);

    const tasks: AgentTask[] = [{ id: 't1', description: 'Do work' }];
    const results = await team.execute(tasks);
    expect(results.length).toBe(1);
    expect(results[0].success).toBe(true);
  });

  it('emits events during execution', async () => {
    const team = new AgentTeam('sequential');
    const agent: AgentDefinition = {
      id: 'a1',
      name: 'Writer',
      role: 'Content Writer',
      goal: 'Write content',
      backstory: 'An experienced writer.',
      tools: [],
      model: 'mock-model',
      adapter: createMockAdapter('Event'),
    };

    team.addAgent(agent);
    const events: string[] = [];
    team.on('task:started', () => events.push('started'));
    team.on('task:completed', () => events.push('completed'));

    await team.execute([{ id: 't1', description: 'Task' }]);
    expect(events).toContain('started');
    expect(events).toContain('completed');
  });

  it('stores task history', async () => {
    const team = new AgentTeam('sequential');
    const agent: AgentDefinition = {
      id: 'a1',
      name: 'Writer',
      role: 'Content Writer',
      goal: 'Write content',
      backstory: 'An experienced writer.',
      tools: [],
      model: 'mock-model',
      adapter: createMockAdapter('History'),
    };

    team.addAgent(agent);
    await team.execute([{ id: 't1', description: 'Task' }]);
    expect(team.getTaskHistory().length).toBe(1);
  });
});
