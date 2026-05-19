/**
 * Orium - Multi-Agent Collaboration System
 * Inspired by CrewAI and LobeChat Agent Groups.
 */

import { EventEmitter } from 'events';
import type { ModelAdapter, CompletionRequest } from '../adapters/base';
import type { ToolSchema, ToolHandler } from '../tools/registry';

export type CollaborationMode = 'sequential' | 'hierarchical' | 'parallel';

export interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  goal: string;
  backstory: string;
  tools: Array<{ schema: ToolSchema; handler: ToolHandler }>;
  model: string;
  adapter: ModelAdapter;
}

export interface AgentTask {
  id: string;
  description: string;
  context?: Record<string, unknown>;
  expectedOutput?: string;
  assignedTo?: string;
  dependencies?: string[];
}

export interface AgentTaskResult {
  taskId: string;
  agentId: string;
  success: boolean;
  output: string;
  metadata?: Record<string, unknown>;
}

export interface DelegationDecision {
  taskId: string;
  assignedAgentId: string;
  reasoning: string;
}

export class AgentTeam extends EventEmitter {
  private agents: Map<string, AgentDefinition> = new Map();
  private mode: CollaborationMode;
  private managerAgentId?: string;
  private taskHistory: AgentTaskResult[] = [];

  constructor(mode: CollaborationMode = 'sequential', managerAgentId?: string) {
    super();
    this.mode = mode;
    this.managerAgentId = managerAgentId;
  }

  addAgent(agent: AgentDefinition): void {
    this.agents.set(agent.id, agent);
    this.emit('agent:added', agent);
  }

  removeAgent(id: string): void {
    const agent = this.agents.get(id);
    if (agent) {
      this.agents.delete(id);
      this.emit('agent:removed', agent);
    }
  }

  getAgent(id: string): AgentDefinition | undefined {
    return this.agents.get(id);
  }

  listAgents(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  setManager(id: string): void {
    if (!this.agents.has(id)) {
      throw new Error(`Agent not found: ${id}`);
    }
    this.managerAgentId = id;
  }

  setMode(mode: CollaborationMode): void {
    this.mode = mode;
  }

  async execute(tasks: AgentTask[]): Promise<AgentTaskResult[]> {
    switch (this.mode) {
      case 'sequential':
        return this.executeSequential(tasks);
      case 'parallel':
        return this.executeParallel(tasks);
      case 'hierarchical':
        return this.executeHierarchical(tasks);
      default:
        throw new Error(`Unknown collaboration mode: ${this.mode}`);
    }
  }

  private async executeSequential(tasks: AgentTask[]): Promise<AgentTaskResult[]> {
    const results: AgentTaskResult[] = [];
    const context: Record<string, unknown> = {};

    for (const task of tasks) {
      const agent = this.selectAgentForTask(task);
      const enrichedTask = { ...task, context: { ...context, ...task.context } };
      const result = await this.runTask(agent, enrichedTask);
      results.push(result);
      if (result.success) {
        context[task.id] = result.output;
      }
    }

    return results;
  }

  private async executeParallel(tasks: AgentTask[]): Promise<AgentTaskResult[]> {
    const promises = tasks.map(async (task) => {
      const agent = this.selectAgentForTask(task);
      return this.runTask(agent, task);
    });
    return Promise.all(promises);
  }

  private async executeHierarchical(tasks: AgentTask[]): Promise<AgentTaskResult[]> {
    if (!this.managerAgentId) {
      throw new Error('Hierarchical mode requires a manager agent');
    }

    const manager = this.agents.get(this.managerAgentId);
    if (!manager) {
      throw new Error(`Manager agent not found: ${this.managerAgentId}`);
    }

    const delegations = await this.delegateTasks(manager, tasks);
    const workerTasks = delegations.map((d) => {
      const task = tasks.find((t) => t.id === d.taskId);
      if (!task) throw new Error(`Task not found: ${d.taskId}`);
      return { ...task, assignedTo: d.assignedAgentId };
    });

    return this.executeParallel(workerTasks);
  }

  private async delegateTasks(
    manager: AgentDefinition,
    tasks: AgentTask[]
  ): Promise<DelegationDecision[]> {
    const agentList = this.listAgents()
      .filter((a) => a.id !== manager.id)
      .map((a) => `${a.id}: ${a.role} - ${a.goal}`)
      .join('\n');

    const prompt = `You are the manager. Available agents:\n${agentList}\n\nTasks:\n${tasks
      .map((t) => `- ${t.id}: ${t.description}`)
      .join('\n')}\n\nAssign each task to the best agent. Return JSON: [{"taskId":"...","assignedAgentId":"...","reasoning":"..."}]`;

    const request: CompletionRequest = {
      messages: [{ role: 'user', content: prompt }],
      model: manager.model,
      temperature: 0.2,
    };

    const response = await manager.adapter.complete(request);
    try {
      const cleaned = response.content.replace(/```json\s*|\s*```/g, '').trim();
      return JSON.parse(cleaned) as DelegationDecision[];
    } catch {
      return tasks.map((t) => ({
        taskId: t.id,
        assignedAgentId: this.listAgents().find((a) => a.id !== manager.id)?.id || manager.id,
        reasoning: 'Fallback assignment',
      }));
    }
  }

  private selectAgentForTask(task: AgentTask): AgentDefinition {
    if (task.assignedTo) {
      const agent = this.agents.get(task.assignedTo);
      if (agent) return agent;
    }
    const candidates = Array.from(this.agents.values());
    if (candidates.length === 0) {
      throw new Error('No agents available');
    }
    return candidates[0];
  }

  private async runTask(agent: AgentDefinition, task: AgentTask): Promise<AgentTaskResult> {
    this.emit('task:started', { task, agent });

    const toolDescriptions = agent.tools
      .map((t) => `- ${t.schema.name}: ${t.schema.description}`)
      .join('\n');

    const prompt = `You are ${agent.name}, ${agent.role}.\nBackstory: ${agent.backstory}\nGoal: ${agent.goal}\n\nTask: ${task.description}\n${task.expectedOutput ? `Expected Output: ${task.expectedOutput}\n` : ''}${task.context ? `Context: ${JSON.stringify(task.context)}\n` : ''}${toolDescriptions ? `Tools:\n${toolDescriptions}\n` : ''}`;

    const request: CompletionRequest = {
      messages: [{ role: 'user', content: prompt }],
      model: agent.model,
      temperature: 0.7,
    };

    try {
      const response = await agent.adapter.complete(request);
      const result: AgentTaskResult = {
        taskId: task.id,
        agentId: agent.id,
        success: true,
        output: response.content,
        metadata: { usage: response.usage },
      };
      this.taskHistory.push(result);
      this.emit('task:completed', result);
      return result;
    } catch (err) {
      const result: AgentTaskResult = {
        taskId: task.id,
        agentId: agent.id,
        success: false,
        output: '',
        metadata: { error: String(err) },
      };
      this.taskHistory.push(result);
      this.emit('task:failed', result);
      return result;
    }
  }

  getTaskHistory(): AgentTaskResult[] {
    return [...this.taskHistory];
  }
}
