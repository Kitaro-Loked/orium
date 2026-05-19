/**
 * Orium Skill - Serper.dev
 * Google Search API integration.
 * https://serper.dev
 */

import { Skill } from '../base';
import type { ToolSchema, ToolHandler } from '../../tools/registry';

export interface SerperSearchResult {
  searchParameters: {
    q: string;
    type: string;
  };
  organic: Array<{
    title: string;
    link: string;
    snippet: string;
    position: number;
  }>;
  knowledgeGraph?: {
    title: string;
    type: string;
    description?: string;
  };
  answerBox?: {
    title?: string;
    answer?: string;
    snippet?: string;
  };
}

export class SerperSkill extends Skill {
  readonly name = 'serper';
  readonly description = 'Serper.dev - Google Search API with structured results';
  readonly category = 'search' as const;

  private apiKey: string;
  private baseUrl = 'https://google.serper.dev';

  constructor(config: { apiKey: string; enabled?: boolean }) {
    super({ enabled: config.enabled ?? true, apiKey: config.apiKey });
    this.apiKey = config.apiKey;
  }

  getTools(): Array<{ schema: ToolSchema; handler: ToolHandler }> {
    return [
      {
        schema: {
          name: 'serper_search',
          description: 'Search Google and get structured results',
          parameters: [
            { name: 'query', type: 'string', description: 'Search query', required: true },
            { name: 'num', type: 'number', description: 'Number of results (1-100)', required: false },
          ],
        },
        handler: async (args) => {
          return this.search(String(args.query), args.num ? Number(args.num) : 10);
        },
      },
      {
        schema: {
          name: 'serper_news',
          description: 'Search Google News',
          parameters: [
            { name: 'query', type: 'string', description: 'News search query', required: true },
            { name: 'num', type: 'number', description: 'Number of results', required: false },
          ],
        },
        handler: async (args) => {
          return this.news(String(args.query), args.num ? Number(args.num) : 10);
        },
      },
    ];
  }

  async search(query: string, num = 10): Promise<SerperSearchResult> {
    const res = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.apiKey,
      },
      body: JSON.stringify({ q: query, num }),
    });

    if (!res.ok) {
      throw new Error(`Serper error: ${res.status} ${await res.text()}`);
    }

    return res.json();
  }

  async news(query: string, num = 10): Promise<SerperSearchResult> {
    const res = await fetch(`${this.baseUrl}/news`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.apiKey,
      },
      body: JSON.stringify({ q: query, num }),
    });

    if (!res.ok) {
      throw new Error(`Serper error: ${res.status} ${await res.text()}`);
    }

    return res.json();
  }

  async activate(): Promise<boolean> {
    if (!this.apiKey) return false;
    return this.healthCheck();
  }

  async deactivate(): Promise<void> {}

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': this.apiKey,
        },
        body: JSON.stringify({ q: 'test', num: 1 }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
