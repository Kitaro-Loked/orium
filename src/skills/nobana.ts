/**
 * Orium Skill - Nobana
 * Knowledge base and Agent platform integration.
 * https://nobana.io
 */

import { Skill } from './base';
import type { ToolSchema, ToolHandler } from '../tools/registry';

export interface NobanaQueryResult {
  answer: string;
  sources: Array<{
    title: string;
    content: string;
    score: number;
  }>;
  confidence: number;
}

export interface NobanaAgentResult {
  response: string;
  actions?: Array<{
    type: string;
    payload: unknown;
  }>;
  metadata?: Record<string, unknown>;
}

export class NobanaSkill extends Skill {
  readonly name = 'nobana';
  readonly description = 'Nobana - Knowledge base query and Agent platform integration';
  readonly category = 'data' as const;

  private apiKey: string;
  private baseUrl: string;
  private knowledgeBaseId?: string;

  constructor(config: { apiKey: string; baseUrl?: string; knowledgeBaseId?: string; enabled?: boolean }) {
    super({ enabled: config.enabled ?? true, apiKey: config.apiKey });
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.nobana.io/v1';
    this.knowledgeBaseId = config.knowledgeBaseId;
  }

  getTools(): Array<{ schema: ToolSchema; handler: ToolHandler }> {
    const tools: Array<{ schema: ToolSchema; handler: ToolHandler }> = [
      {
        schema: {
          name: 'nobana_query',
          description: 'Query Nobana knowledge base for answers with source citations',
          parameters: [
            { name: 'question', type: 'string', description: 'Question to ask the knowledge base', required: true },
            { name: 'knowledgeBaseId', type: 'string', description: 'Knowledge base ID (optional)', required: false },
            { name: 'topK', type: 'number', description: 'Number of sources to retrieve', required: false },
          ],
        },
        handler: async (args) => {
          return this.query(String(args.question), {
            knowledgeBaseId: args.knowledgeBaseId as string,
            topK: args.topK ? Number(args.topK) : 5,
          });
        },
      },
      {
        schema: {
          name: 'nobana_agent',
          description: 'Invoke a Nobana agent to perform a task',
          parameters: [
            { name: 'agentId', type: 'string', description: 'Agent ID to invoke', required: true },
            { name: 'input', type: 'string', description: 'Input for the agent', required: true },
            { name: 'context', type: 'string', description: 'Additional context', required: false },
          ],
        },
        handler: async (args) => {
          return this.invokeAgent(String(args.agentId), String(args.input), args.context as string);
        },
      },
    ];

    return tools;
  }

  async query(question: string, options: { knowledgeBaseId?: string; topK?: number } = {}): Promise<NobanaQueryResult> {
    const kbId = options.knowledgeBaseId || this.knowledgeBaseId;

    const res = await fetch(`${this.baseUrl}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        question,
        knowledge_base_id: kbId,
        top_k: options.topK || 5,
      }),
    });

    if (!res.ok) {
      throw new Error(`Nobana error: ${res.status} ${await res.text()}`);
    }

    return res.json();
  }

  async invokeAgent(agentId: string, input: string, context?: string): Promise<NobanaAgentResult> {
    const res = await fetch(`${this.baseUrl}/agents/${agentId}/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input,
        context,
      }),
    });

    if (!res.ok) {
      throw new Error(`Nobana agent error: ${res.status} ${await res.text()}`);
    }

    return res.json();
  }

  async listKnowledgeBases(): Promise<Array<{ id: string; name: string; description?: string }>> {
    const res = await fetch(`${this.baseUrl}/knowledge-bases`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!res.ok) {
      throw new Error(`Nobana error: ${res.status}`);
    }

    const data = await res.json();
    return data.knowledge_bases || [];
  }

  async listAgents(): Promise<Array<{ id: string; name: string; description?: string }>> {
    const res = await fetch(`${this.baseUrl}/agents`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!res.ok) {
      throw new Error(`Nobana error: ${res.status}`);
    }

    const data = await res.json();
    return data.agents || [];
  }

  async activate(): Promise<boolean> {
    if (!this.apiKey) return false;
    return this.healthCheck();
  }

  async deactivate(): Promise<void> {}

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
