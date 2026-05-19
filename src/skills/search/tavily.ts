/**
 * Orium Skill - Tavily AI Search
 * Deep research and web search API integration.
 * https://tavily.com
 */

import { Skill } from '../base';
import type { ToolSchema, ToolHandler } from '../../tools/registry';

export interface TavilySearchOptions {
  query: string;
  searchDepth?: 'basic' | 'advanced';
  includeAnswer?: boolean;
  includeImages?: boolean;
  includeRawContent?: boolean;
  maxResults?: number;
  topic?: 'general' | 'news' | 'finance';
  days?: number;
}

export interface TavilySearchResult {
  answer?: string;
  query: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    rawContent?: string;
  }>;
  images?: Array<{
    url: string;
    description?: string;
  }>;
  responseTime: number;
}

export class TavilySkill extends Skill {
  readonly name = 'tavily';
  readonly description = 'Tavily AI Search - Deep research and web search with structured results';
  readonly category = 'search' as const;

  private apiKey: string;
  private baseUrl = 'https://api.tavily.com';

  constructor(config: { apiKey: string; enabled?: boolean }) {
    super({ enabled: config.enabled ?? true, apiKey: config.apiKey });
    this.apiKey = config.apiKey;
  }

  getTools(): Array<{ schema: ToolSchema; handler: ToolHandler }> {
    return [
      {
        schema: {
          name: 'tavily_search',
          description: 'Search the web using Tavily AI for comprehensive, structured results with source citations',
          parameters: [
            { name: 'query', type: 'string', description: 'Search query', required: true },
            { name: 'searchDepth', type: 'string', description: 'Search depth: basic or advanced', required: false, enum: ['basic', 'advanced'] },
            { name: 'maxResults', type: 'number', description: 'Maximum results (1-20)', required: false },
            { name: 'topic', type: 'string', description: 'Topic category', required: false, enum: ['general', 'news', 'finance'] },
            { name: 'days', type: 'number', description: 'Number of days back for news', required: false },
          ],
        },
        handler: async (args) => {
          return this.search({
            query: String(args.query),
            searchDepth: (args.searchDepth as any) || 'basic',
            maxResults: Number(args.maxResults) || 5,
            topic: (args.topic as any) || 'general',
            days: args.days ? Number(args.days) : undefined,
          });
        },
      },
      {
        schema: {
          name: 'tavily_qna',
          description: 'Ask a question and get an AI-generated answer with source citations',
          parameters: [
            { name: 'question', type: 'string', description: 'The question to answer', required: true },
            { name: 'searchDepth', type: 'string', description: 'Search depth', required: false, enum: ['basic', 'advanced'] },
          ],
        },
        handler: async (args) => {
          return this.search({
            query: String(args.question),
            searchDepth: (args.searchDepth as any) || 'advanced',
            includeAnswer: true,
            maxResults: 5,
          });
        },
      },
    ];
  }

  async search(options: TavilySearchOptions): Promise<TavilySearchResult> {
    const res = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        query: options.query,
        search_depth: options.searchDepth || 'basic',
        include_answer: options.includeAnswer ?? false,
        include_images: options.includeImages ?? false,
        include_raw_content: options.includeRawContent ?? false,
        max_results: options.maxResults || 5,
        topic: options.topic || 'general',
        days: options.days,
      }),
    });

    if (!res.ok) {
      throw new Error(`Tavily API error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      answer: data.answer,
      query: data.query,
      results: data.results || [],
      images: data.images,
      responseTime: data.response_time,
    };
  }

  async activate(): Promise<boolean> {
    if (!this.apiKey) return false;
    return this.healthCheck();
  }

  async deactivate(): Promise<void> {
    // Stateless API, nothing to clean up
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: this.apiKey,
          query: 'test',
          max_results: 1,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
