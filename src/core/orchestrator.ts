/**
 * Orium - Core Orchestrator
 * The central nervous system of the AI infrastructure.
 */

import { EventEmitter } from 'events';

export interface Agent {
  id: string;
  name: string;
  capabilities: string[];
  execute(task: Task): Promise<Result>;
}

export interface Task {
  id: string;
  type: string;
  payload: unknown;
  priority: number;
  timeout?: number;
}

export interface Result {
  taskId: string;
  success: boolean;
  data: unknown;
  latency: number;
}

export class Orchestrator extends EventEmitter {
  private agents: Map<string, Agent> = new Map();
  private taskQueue: Task[] = [];
  private running = false;

  registerAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
    this.emit('agent:registered', agent);
  }

  unregisterAgent(id: string): void {
    const agent = this.agents.get(id);
    if (agent) {
      this.agents.delete(id);
      this.emit('agent:unregistered', agent);
    }
  }

  async submitTask(task: Task): Promise<Result> {
    this.taskQueue.push(task);
    this.taskQueue.sort((a, b) => b.priority - a.priority);
    this.emit('task:queued', task);
    return this.processTask(task);
  }

  private async processTask(task: Task): Promise<Result> {
    const start = Date.now();
    const capableAgents = Array.from(this.agents.values()).filter((a) =>
      a.capabilities.includes(task.type)
    );

    if (capableAgents.length === 0) {
      return {
        taskId: task.id,
        success: false,
        data: { error: `No agent capable of task type: ${task.type}` },
        latency: Date.now() - start,
      };
    }

    // Simple round-robin for now; can be replaced with smarter scheduling
    const agent = capableAgents[0];
    this.emit('task:started', { task, agent });

    try {
      const result = await agent.execute(task);
      this.emit('task:completed', result);
      return { ...result, latency: Date.now() - start };
    } catch (err) {
      const failed: Result = {
        taskId: task.id,
        success: false,
        data: { error: String(err) },
        latency: Date.now() - start,
      };
      this.emit('task:failed', failed);
      return failed;
    }
  }

  start(): void {
    this.running = true;
    this.emit('orchestrator:started');
  }

  stop(): void {
    this.running = false;
    this.emit('orchestrator:stopped');
  }

  getAgentCount(): number {
    return this.agents.size;
  }

  getQueuedTaskCount(): number {
    return this.taskQueue.length;
  }
}

export const orium = new Orchestrator();
