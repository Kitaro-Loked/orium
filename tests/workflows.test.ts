import { describe, it, expect } from 'vitest';
import {
  WorkflowEngine,
  type WorkflowDefinition,
  type WorkflowNode,
  type NodeExecutor,
} from '../src/workflows/engine';

describe('WorkflowEngine', () => {
  const createWorkflow = (nodes: WorkflowNode[]): WorkflowDefinition => ({
    id: 'wf-1',
    name: 'Test Workflow',
    nodes,
    edges: [],
    variables: [{ name: 'input', value: 'hello' }],
  });

  it('registers and uses a node executor', async () => {
    const engine = new WorkflowEngine();
    const executor: NodeExecutor = async (_node, variables) => {
      return `echo:${variables.get('input')}`;
    };

    engine.registerExecutor('tool', executor);

    const workflow = createWorkflow([
      { id: 'n1', type: 'tool', config: { outputVar: 'result' } },
    ]);

    const state = await engine.execute(workflow);
    expect(state.status).toBe('completed');
    expect(state.nodeResults.get('n1')?.success).toBe(true);
    expect(state.nodeResults.get('n1')?.output).toBe('echo:hello');
    expect(state.variables.get('result')).toBe('echo:hello');
  });

  it('executes nodes sequentially with dependencies', async () => {
    const engine = new WorkflowEngine();
    const order: string[] = [];

    engine.registerExecutor('tool', async (node) => {
      order.push(node.id);
      return `done:${node.id}`;
    });

    const workflow = createWorkflow([
      { id: 'n1', type: 'tool', config: {} },
      { id: 'n2', type: 'tool', config: {}, dependsOn: ['n1'] },
      { id: 'n3', type: 'tool', config: {}, dependsOn: ['n2'] },
    ]);

    const state = await engine.execute(workflow);
    expect(state.status).toBe('completed');
    expect(order).toEqual(['n1', 'n2', 'n3']);
  });

  it('executes independent nodes in parallel', async () => {
    const engine = new WorkflowEngine();
    engine.registerExecutor('tool', async (node) => `result:${node.id}`);

    const workflow = createWorkflow([
      { id: 'n1', type: 'tool', config: {} },
      { id: 'n2', type: 'tool', config: {} },
      { id: 'n3', type: 'tool', config: {}, dependsOn: ['n1', 'n2'] },
    ]);

    const state = await engine.execute(workflow);
    expect(state.status).toBe('completed');
    expect(state.nodeResults.get('n1')?.output).toBe('result:n1');
    expect(state.nodeResults.get('n2')?.output).toBe('result:n2');
    expect(state.nodeResults.get('n3')?.output).toBe('result:n3');
  });

  it('fails when no executor is registered', async () => {
    const engine = new WorkflowEngine();
    const workflow = createWorkflow([{ id: 'n1', type: 'llm', config: {} }]);

    const state = await engine.execute(workflow);
    expect(state.status).toBe('failed');
    expect(state.nodeResults.get('n1')?.success).toBe(false);
  });

  it('fails on circular dependencies', async () => {
    const engine = new WorkflowEngine();
    engine.registerExecutor('tool', async () => 'ok');

    const workflow = createWorkflow([
      { id: 'n1', type: 'tool', config: {}, dependsOn: ['n2'] },
      { id: 'n2', type: 'tool', config: {}, dependsOn: ['n1'] },
    ]);

    const state = await engine.execute(workflow);
    expect(state.status).toBe('failed');
    expect(state.error).toContain('Circular dependency');
  });

  it('emits workflow lifecycle events', async () => {
    const engine = new WorkflowEngine();
    engine.registerExecutor('tool', async () => 'ok');

    const events: string[] = [];
    engine.on('workflow:started', () => events.push('started'));
    engine.on('workflow:completed', () => events.push('completed'));

    const workflow = createWorkflow([{ id: 'n1', type: 'tool', config: {} }]);
    await engine.execute(workflow);

    expect(events).toContain('started');
    expect(events).toContain('completed');
  });

  it('retrieves execution state', async () => {
    const engine = new WorkflowEngine();
    engine.registerExecutor('tool', async () => 'ok');

    const workflow = createWorkflow([{ id: 'n1', type: 'tool', config: {} }]);
    await engine.execute(workflow);

    const state = engine.getState('wf-1');
    expect(state).toBeDefined();
    expect(state?.status).toBe('completed');
  });

  it('resets execution state', async () => {
    const engine = new WorkflowEngine();
    engine.registerExecutor('tool', async () => 'ok');

    const workflow = createWorkflow([{ id: 'n1', type: 'tool', config: {} }]);
    await engine.execute(workflow);

    engine.resetState('wf-1');
    expect(engine.getState('wf-1')).toBeUndefined();
  });
});
