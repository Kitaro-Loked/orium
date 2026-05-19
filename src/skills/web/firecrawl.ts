/**
 * Orium Skill - Firecrawl
 * Web scraping and content extraction API.
 * https://firecrawl.dev
 */

import { Skill } from '../base';
import type { ToolSchema, ToolHandler } from '../../tools/registry';

export interface ScrapeResult {
  url: string;
  markdown?: string;
  html?: string;
  metadata?: {
    title?: string;
    description?: string;
    language?: string;
    sourceURL?: string;
    statusCode?: number;
  };
  links?: {
    onPage?: string[];
    sameDomain?: string[];
    external?: string[];
  };
}

export interface CrawlResult {
  id: string;
  status: 'scraping' | 'completed' | 'failed';
  total: number;
  completed: number;
  data?: ScrapeResult[];
}

export class FirecrawlSkill extends Skill {
  readonly name = 'firecrawl';
  readonly description = 'Firecrawl - Web scraping, content extraction, and site crawling';
  readonly category = 'web' as const;

  private apiKey: string;
  private baseUrl = 'https://api.firecrawl.dev/v1';

  constructor(config: { apiKey: string; enabled?: boolean }) {
    super({ enabled: config.enabled ?? true, apiKey: config.apiKey });
    this.apiKey = config.apiKey;
  }

  getTools(): Array<{ schema: ToolSchema; handler: ToolHandler }> {
    return [
      {
        schema: {
          name: 'firecrawl_scrape',
          description: 'Scrape a single webpage and extract clean markdown content',
          parameters: [
            { name: 'url', type: 'string', description: 'URL to scrape', required: true },
            { name: 'formats', type: 'string', description: 'Output formats: markdown, html, screenshot', required: false },
            { name: 'onlyMainContent', type: 'boolean', description: 'Extract only main content', required: false },
          ],
        },
        handler: async (args) => {
          return this.scrape(String(args.url), {
            formats: args.formats ? String(args.formats).split(',') : ['markdown'],
            onlyMainContent: args.onlyMainContent !== false,
          });
        },
      },
      {
        schema: {
          name: 'firecrawl_crawl',
          description: 'Crawl an entire website',
          parameters: [
            { name: 'url', type: 'string', description: 'Starting URL', required: true },
            { name: 'limit', type: 'number', description: 'Max pages to crawl', required: false },
            { name: 'includePaths', type: 'string', description: 'URL paths to include (comma-separated)', required: false },
            { name: 'excludePaths', type: 'string', description: 'URL paths to exclude (comma-separated)', required: false },
          ],
        },
        handler: async (args) => {
          return this.crawl(String(args.url), {
            limit: args.limit ? Number(args.limit) : 10,
            includePaths: args.includePaths ? String(args.includePaths).split(',') : undefined,
            excludePaths: args.excludePaths ? String(args.excludePaths).split(',') : undefined,
          });
        },
      },
      {
        schema: {
          name: 'firecrawl_search',
          description: 'Search and scrape results from the web',
          parameters: [
            { name: 'query', type: 'string', description: 'Search query', required: true },
            { name: 'limit', type: 'number', description: 'Number of results', required: false },
          ],
        },
        handler: async (args) => {
          return this.search(String(args.query), args.limit ? Number(args.limit) : 5);
        },
      },
    ];
  }

  async scrape(url: string, options: { formats?: string[]; onlyMainContent?: boolean } = {}): Promise<ScrapeResult> {
    const res = await fetch(`${this.baseUrl}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: options.formats || ['markdown'],
        onlyMainContent: options.onlyMainContent ?? true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Firecrawl error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return data.data;
  }

  async crawl(url: string, options: { limit?: number; includePaths?: string[]; excludePaths?: string[] } = {}): Promise<CrawlResult> {
    const res = await fetch(`${this.baseUrl}/crawl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        url,
        limit: options.limit || 10,
        includePaths: options.includePaths,
        excludePaths: options.excludePaths,
        scrapeOptions: { formats: ['markdown'] },
      }),
    });

    if (!res.ok) {
      throw new Error(`Firecrawl error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: data.id,
      status: data.status,
      total: data.total,
      completed: data.completed,
    };
  }

  async getCrawlStatus(id: string): Promise<CrawlResult> {
    const res = await fetch(`${this.baseUrl}/crawl/${id}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!res.ok) {
      throw new Error(`Firecrawl error: ${res.status}`);
    }

    const data = await res.json();
    return {
      id: data.id,
      status: data.status,
      total: data.total,
      completed: data.completed,
      data: data.data,
    };
  }

  async search(query: string, limit = 5): Promise<ScrapeResult[]> {
    const res = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ query, limit }),
    });

    if (!res.ok) {
      throw new Error(`Firecrawl error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return data.data || [];
  }

  async activate(): Promise<boolean> {
    if (!this.apiKey) return false;
    return this.healthCheck();
  }

  async deactivate(): Promise<void> {}

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/status`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
