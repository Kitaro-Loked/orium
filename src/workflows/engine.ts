/**
 * Orium - Workflow Engine
 * Supports node-based workflow execution with serial and parallel scheduling.
 */

import { EventEmitter } from 'events';

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed';
export type NodeType = 'llm' | 'condition' | 'tool' | 'knowledge_base' | 'input' | 'output' | 'delay';

export interface WorkflowNode {
  id: string;
  type: NodeType;
  config: Record<string, unknown>;
  dependsOn?: string[];
}

export interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface WorkflowVariable {
  name: string;
  value: unknown;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: WorkflowVariable[];
}

export interface NodeExecutionResult {
  nodeId: string;
  success: boolean;
  output: unknown;
  startedAt: Date;
  completedAt: Date;
}

export interface WorkflowExecutionState {
  workflowId: string;
  status: WorkflowStatus;
  nodeResults: Map<string, NodeExecutionResult>;
  variables: Map<string, unknown>;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export type NodeExecutor = (node: WorkflowNode, variables: Map<string, unknown>) => Promise<unknown>;

export class WorkflowEngine extends EventEmitter {
  private executors: Map<NodeType, NodeExecutor> = new Map();
  private states: Map<string, WorkflowExecutionState> = new Map();

  registerExecutor(type: NodeType, executor: NodeExecutor): void {
    this.executors.set(type, executor);
  }

  async execute(workflow: WorkflowDefinition): Promise<WorkflowExecutionState> {
    const state: WorkflowExecutionState = {
      workflowId: workflow.id,
      status: 'running',
      nodeResults: new Map(),
      variables: new Map(workflow.variables.map((v) => [v.name, v.value])),
      startedAt: new Date(),
    };

    this.states.set(workflow.id, state);
    this.emit('workflow:started', { workflowId: workflow.id });

    try {
      const nodeMap = new Map(workflow.nodes.map((n) => [n.id, n]));
      const executed = new Set<string>();
      const pending = new Set(workflow.nodes.map((n) => n.id));

      while (pending.size > 0) {
        const ready = Array.from(pending).filter((id) => {
          const node = nodeMap.get(id)!;
          return (node.dependsOn || []).every((dep) => executed.has(dep));
        });

        if (ready.length === 0 && pending.size > 0) {
          throw new Error('Circular dependency detected or unresolved dependencies');
        }

        const batchResults = await Promise.all(
          ready.map((id) => this.executeNode(nodeMap.get(id)!, state))
        );

        for (const result of batchResults) {
          state.nodeResults.set(result.nodeId, result);
          executed.add(result.nodeId);
          pending.delete(result.nodeId);

          if (!result.success) {
            state.status = 'failed';
            state.error = `Node ${result.nodeId} failed`;
            state.completedAt = new Date();
            this.emit('workflow:failed', { workflowId: workflow.id, error: state.error });
            return state;
          }
        }
      }

      state.status = 'completed';
      state.completedAt = new Date();
      this.emit('workflow:completed', { workflowId: workflow.id });
    } catch (err) {
      state.status = 'failed';
      state.error = String(err);
      state.completedAt = new Date();
      this.emit('workflow:failed', { workflowId: workflow.id, error: state.error });
    }

    return state;
  }

  private async executeNode(
    node: WorkflowNode,
    state: WorkflowExecutionState
  ): Promise<NodeExecutionResult> {
    const startedAt = new Date();
    this.emit('node:started', { nodeId: node.id, workflowId: state.workflowId });

    const executor = this.executors.get(node.type);
    if (!executor) {
      const result: NodeExecutionResult = {
        nodeId: node.id,
        success: false,
        output: `No executor registered for node type: ${node.type}`,
        startedAt,
        completedAt: new Date(),
      };
      this.emit('node:completed', { nodeId: node.id, result });
      return result;
    }

    try {
      const output = await executor(node, state.variables);
      if (node.config.outputVar && typeof node.config.outputVar === 'string') {
        state.variables.set(node.config.outputVar, output);
      }
      const result: NodeExecutionResult = {
        nodeId: node.id,
        success: true,
        output,
        startedAt,
        completedAt: new Date(),
      };
      this.emit('node:completed', { nodeId: node.id, result });
      return result;
    } catch (err) {
      const result: NodeExecutionResult = {
        nodeId: node.id,
        success: false,
        output: String(err),
        startedAt,
        completedAt: new Date(),
      };
      this.emit('node:failed', { nodeId: node.id, result });
      return result;
    }
  }

  getState(workflowId: string): WorkflowExecutionState | undefined {
    return this.states.get(workflowId);
  }

  resetState(workflowId: string): void {
    this.states.delete(workflowId);
  }
}
