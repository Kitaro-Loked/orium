/**
 * Orium - HTTP Server
 * REST API for chat, adapters, skills, and services.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { URL } from 'url';
import type { AdapterRegistry, ModelAdapter } from '../adapters/base.js';
import { ChatSession } from '../chat/session.js';
import type { SkillRegistry } from '../skills/base.js';
import { serveUI } from '../ui/index.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export interface ServerOptions {
  port?: number;
  adapterRegistry: AdapterRegistry;
  skillRegistry?: SkillRegistry;
  defaultAdapter?: string;
  apiKey?: string;
}

export class OriumServer {
  private port: number;
  private adapterRegistry: AdapterRegistry;
  private skillRegistry?: SkillRegistry;
  private defaultAdapter?: string;
  private apiKey?: string;
  private sessions: Map<string, ChatSession> = new Map();

  constructor(options: ServerOptions) {
    this.port = options.port || 3000;
    this.adapterRegistry = options.adapterRegistry;
    this.skillRegistry = options.skillRegistry;
    this.defaultAdapter = options.defaultAdapter;
    this.apiKey = options.apiKey;
  }

  start(): void {
    const server = createServer((req, res) => {
      for (const [key, value] of Object.entries(CORS_HEADERS)) {
        res.setHeader(key, value);
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (this.apiKey) {
        const auth = req.headers.authorization;
        if (!auth || auth !== `Bearer ${this.apiKey}`) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
      }

      this.handleRequest(req, res).catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      });
    });

    server.listen(this.port, () => {
      console.log(`Orium server running on http://localhost:${this.port}`);
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Serve UI static files
    if (serveUI(req, res)) return;

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;
    const method = req.method || 'GET';

    if (path === '/health' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', version: '0.1.0' }));
      return;
    }

    if (path === '/v1/adapters' && method === 'GET') {
      const adapters = this.adapterRegistry.list().map((name) => {
        const a = this.adapterRegistry.get(name);
        return { name, supportedModels: a?.supportedModels || [] };
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ adapters }));
      return;
    }

    if (path === '/v1/skills' && method === 'GET') {
      const skills = this.skillRegistry?.list() || [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ skills }));
      return;
    }

    if (path === '/v1/chat/completions' && method === 'POST') {
      await this.handleChatCompletion(req, res);
      return;
    }

    if (path === '/v1/sessions' && method === 'POST') {
      const body = await this.readBody(req);
      const data = JSON.parse(body);
      const sessionId = `sess-${Date.now()}`;
      const adapter = this.getAdapter(data.adapter || this.defaultAdapter);

      if (!adapter) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Adapter not found' }));
        return;
      }

      const session = new ChatSession(adapter, {
        model: data.model,
        systemPrompt: data.systemPrompt,
        temperature: data.temperature,
      }, this.skillRegistry);

      this.sessions.set(sessionId, session);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessionId, adapter: adapter.name }));
      return;
    }

    if (path.startsWith('/v1/sessions/') && path.endsWith('/messages') && method === 'POST') {
      const sessionId = path.split('/')[3];
      const session = this.sessions.get(sessionId);

      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }

      const body = await this.readBody(req);
      const data = JSON.parse(body);

      const response = await session.send(data.message, data.imageUrl);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: response.id,
        role: response.role,
        content: response.content,
        model: response.model,
        usage: response.usage,
        toolCalls: response.toolCalls,
      }));
      return;
    }

    if (path.startsWith('/v1/sessions/') && path.endsWith('/history') && method === 'GET') {
      const sessionId = path.split('/')[3];
      const session = this.sessions.get(sessionId);

      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ messages: session.getHistory() }));
      return;
    }

    if (path === '/v1/tools/execute' && method === 'POST') {
      const body = await this.readBody(req);
      const data = JSON.parse(body);

      if (!this.skillRegistry) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Skill registry not available' }));
        return;
      }

      try {
        const tools = this.skillRegistry.getAllTools();
        const tool = tools.find((t) => t.schema.name === data.tool);
        if (!tool) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Tool not found: ${data.tool}` }));
          return;
        }

        const result = await tool.handler(data.arguments || {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private async handleChatCompletion(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const data = JSON.parse(body);

    const adapter = this.getAdapter(data.adapter);
    if (!adapter) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Adapter not found' }));
      return;
    }

    const session = new ChatSession(adapter, {
      model: data.model,
      temperature: data.temperature,
      maxTokens: data.max_tokens,
    }, this.skillRegistry);

    if (data.messages) {
      for (const msg of data.messages) {
        if (msg.role === 'system') session.setSystemPrompt(msg.content);
      }
    }

    const lastMessage = data.messages?.[data.messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Last message must be from user' }));
      return;
    }

    const response = await session.send(lastMessage.content);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: response.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: response.content,
        },
        finish_reason: 'stop',
      }],
      usage: response.usage,
    }));
  }

  private getAdapter(name?: string): ModelAdapter | undefined {
    if (name) return this.adapterRegistry.get(name);
    if (this.defaultAdapter) return this.adapterRegistry.get(this.defaultAdapter);
    const first = this.adapterRegistry.list()[0];
    return first ? this.adapterRegistry.get(first) : undefined;
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }
}
