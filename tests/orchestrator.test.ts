import { describe, it, expect } from 'vitest';
import { Orchestrator, Agent, Task } from '../src/core/orchestrator';

describe('Orchestrator', () => {
  it('registers and unregisters agents', () => {
    const orch = new Orchestrator();
    const agent: Agent = {
      id: 'test-1',
      name: 'TestAgent',
      capabilities: ['math'],
      execute: async (task) => ({
        taskId: task.id,
        success: true,
        data: 42,
        latency: 0,
      }),
    };

    orch.registerAgent(agent);
    expect(orch.getAgentCount()).toBe(1);

    orch.unregisterAgent('test-1');
    expect(orch.getAgentCount()).toBe(0);
  });

  it('executes a task with a capable agent', async () => {
    const orch = new Orchestrator();
    const agent: Agent = {
      id: 'math-bot',
      name: 'MathBot',
      capabilities: ['math'],
      execute: async (task) => ({
        taskId: task.id,
        success: true,
        data: 42,
        latency: 0,
      }),
    };

    orch.registerAgent(agent);
    const task: Task = {
      id: 't1',
      type: 'math',
      payload: { expr: '6*7' },
      priority: 1,
    };

    const result = await orch.submitTask(task);
    expect(result.success).toBe(true);
    expect(result.data).toBe(42);
  });

  it('fails when no capable agent exists', async () => {
    const orch = new Orchestrator();
    const task: Task = {
      id: 't2',
      type: 'unknown',
      payload: {},
      priority: 1,
    };

    const result = await orch.submitTask(task);
    expect(result.success).toBe(false);
  });
});
