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
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export interface ServerOptions {
  port?: number;
  host?: string;
  adapterRegistry: AdapterRegistry;
  skillRegistry?: SkillRegistry;
  defaultAdapter?: string;
  apiKey?: string;
}

// -- In-Memory Store Types --

interface AgentDef {
  id: string;
  name: string;
  description: string;
  model: string;
  systemPrompt?: string;
  tools?: string[];
  createdAt: number;
  updatedAt: number;
}

interface WorkflowDef {
  id: string;
  name: string;
  description: string;
  nodes: unknown[];
  edges: unknown[];
  createdAt: number;
  updatedAt: number;
}

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  documents: Array<{
    id: string;
    content: string;
    metadata?: Record<string, unknown>;
    createdAt: number;
  }>;
  createdAt: number;
  updatedAt: number;
}

interface FileEntry {
  id: string;
  filename: string;
  purpose: string;
  bytes: number;
  contentType: string;
  data: string; // base64
  createdAt: number;
}

interface BatchJob {
  id: string;
  endpoint: string;
  inputFileId: string;
  status: 'validating' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  outputFileId?: string;
  errorFileId?: string;
  requestCounts?: {
    total: number;
    completed: number;
    failed: number;
  };
  createdAt: number;
  completedAt?: number;
}

export class OriumServer {
  private port: number;
  private host: string;
  private adapterRegistry: AdapterRegistry;
  private skillRegistry?: SkillRegistry;
  private defaultAdapter?: string;
  private apiKey?: string;
  private sessions: Map<string, ChatSession> = new Map();
  // In-memory stores
  private agents: Map<string, AgentDef> = new Map();
  private workflows: Map<string, WorkflowDef> = new Map();
  private knowledgeBases: Map<string, KnowledgeBase> = new Map();
  private files: Map<string, FileEntry> = new Map();
  private batches: Map<string, BatchJob> = new Map();

  constructor(options: ServerOptions) {
    this.port = options.port || 3000;
    this.host = options.host || '127.0.0.1';
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

    server.listen(this.port, this.host, () => {
      console.log(`Orium server running on http://${this.host}:${this.port}`);
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

    // =============================================================
    //  NEW ENDPOINTS
    // =============================================================

    // -- Models --
    if (path === '/v1/models' && method === 'GET') {
      await this.handleListModels(res);
      return;
    }

    const modelsMatch = path.match(/^\/v1\/models\/([^/]+)$/);
    if (modelsMatch && method === 'GET') {
      await this.handleGetModel(res, modelsMatch[1]);
      return;
    }

    // -- Embeddings --
    if (path === '/v1/embeddings' && method === 'POST') {
      await this.handleEmbeddings(req, res);
      return;
    }

    // -- Images --
    if (path === '/v1/images/generations' && method === 'POST') {
      await this.handleImageGenerations(req, res);
      return;
    }

    if (path === '/v1/images/edits' && method === 'POST') {
      await this.handleImageEdits(req, res);
      return;
    }

    // -- Audio --
    if (path === '/v1/audio/transcriptions' && method === 'POST') {
      await this.handleAudioTranscriptions(req, res);
      return;
    }

    if (path === '/v1/audio/speech' && method === 'POST') {
      await this.handleAudioSpeech(req, res);
      return;
    }

    // -- Files --
    if (path === '/v1/files' && method === 'POST') {
      await this.handleUploadFile(req, res);
      return;
    }

    if (path === '/v1/files' && method === 'GET') {
      await this.handleListFiles(res);
      return;
    }

    const fileMatch = path.match(/^\/v1\/files\/([^/]+)$/);
    if (fileMatch && method === 'GET') {
      await this.handleGetFile(res, fileMatch[1]);
      return;
    }
    if (fileMatch && method === 'DELETE') {
      await this.handleDeleteFile(res, fileMatch[1]);
      return;
    }

    // -- Knowledge Bases --
    if (path === '/v1/knowledge-bases' && method === 'POST') {
      await this.handleCreateKnowledgeBase(req, res);
      return;
    }

    if (path === '/v1/knowledge-bases' && method === 'GET') {
      await this.handleListKnowledgeBases(res);
      return;
    }

    const kbDocMatch = path.match(/^\/v1\/knowledge-bases\/([^/]+)\/documents$/);
    if (kbDocMatch && method === 'POST') {
      await this.handleAddDocument(req, res, kbDocMatch[1]);
      return;
    }

    const kbQueryMatch = path.match(/^\/v1\/knowledge-bases\/([^/]+)\/query$/);
    if (kbQueryMatch && method === 'POST') {
      await this.handleQueryKnowledgeBase(req, res, kbQueryMatch[1]);
      return;
    }

    // -- Agents --
    if (path === '/v1/agents' && method === 'POST') {
      await this.handleCreateAgent(req, res);
      return;
    }

    if (path === '/v1/agents' && method === 'GET') {
      await this.handleListAgents(res);
      return;
    }

    const agentMatch = path.match(/^\/v1\/agents\/([^/]+)$/);
    if (agentMatch && method === 'GET') {
      await this.handleGetAgent(res, agentMatch[1]);
      return;
    }
    if (agentMatch && method === 'PUT') {
      await this.handleUpdateAgent(req, res, agentMatch[1]);
      return;
    }
    if (agentMatch && method === 'DELETE') {
      await this.handleDeleteAgent(res, agentMatch[1]);
      return;
    }

    const agentRunMatch = path.match(/^\/v1\/agents\/([^/]+)\/run$/);
    if (agentRunMatch && method === 'POST') {
      await this.handleRunAgent(req, res, agentRunMatch[1]);
      return;
    }

    // -- Workflows --
    if (path === '/v1/workflows' && method === 'POST') {
      await this.handleCreateWorkflow(req, res);
      return;
    }

    if (path === '/v1/workflows' && method === 'GET') {
      await this.handleListWorkflows(res);
      return;
    }

    const wfRunMatch = path.match(/^\/v1\/workflows\/([^/]+)\/run$/);
    if (wfRunMatch && method === 'POST') {
      await this.handleRunWorkflow(req, res, wfRunMatch[1]);
      return;
    }

    // -- Batches --
    if (path === '/v1/batches' && method === 'POST') {
      await this.handleCreateBatch(req, res);
      return;
    }

    const batchMatch = path.match(/^\/v1\/batches\/([^/]+)$/);
    if (batchMatch && method === 'GET') {
      await this.handleGetBatch(res, batchMatch[1]);
      return;
    }

    // -- Status --
    if (path === '/v1/status' && method === 'GET') {
      await this.handleStatus(res);
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
  // =============================================================
  //  MODELS
  // =============================================================

  private async handleListModels(res: ServerResponse): Promise<void> {
    const models: Array<{ id: string; object: string; created: number; owned_by: string }> = [];
    for (const name of this.adapterRegistry.list()) {
      const adapter = this.adapterRegistry.get(name);
      if (!adapter) continue;
      for (const model of adapter.supportedModels) {
        models.push({ id: model, object: 'model', created: 0, owned_by: name });
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: models }));
  }

  private async handleGetModel(res: ServerResponse, modelId: string): Promise<void> {
    for (const name of this.adapterRegistry.list()) {
      const adapter = this.adapterRegistry.get(name);
      if (!adapter) continue;
      if (adapter.supportedModels.includes(modelId)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: modelId, object: 'model', created: 0, owned_by: name }));
        return;
      }
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Model not found' }));
  }

  // =============================================================
  //  EMBEDDINGS
  // =============================================================

  private async handleEmbeddings(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const data = JSON.parse(body);
    const input = data.input;
    const model = data.model || 'text-embedding-ada-002';
    const inputs = Array.isArray(input) ? input : [input];
    const embeddings = inputs.map((text: string, index: number) => ({
      object: 'embedding' as const,
      embedding: this.generatePseudoEmbedding(text, model),
      index,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      object: 'list',
      data: embeddings,
      model,
      usage: { prompt_tokens: inputs.join('').length, total_tokens: inputs.join('').length },
    }));
  }

  private generatePseudoEmbedding(text: string, model: string): number[] {
    const dim = model.includes('3-large') ? 3072 : model.includes('3-small') ? 1536 : 1536;
    const embedding: number[] = [];
    let seed = 0;
    for (let i = 0; i < text.length; i++) {
      seed = (seed * 31 + text.charCodeAt(i)) % 1000000007;
    }
    for (let i = 0; i < dim; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483647;
      embedding.push((seed / 2147483647) * 2 - 1);
    }
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    return embedding.map((v) => v / (norm || 1));
  }

  // =============================================================
  //  IMAGES
  // =============================================================

  private async handleImageGenerations(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const data = JSON.parse(body);
    const n = data.n || 1;
    const images = Array.from({ length: n }, (_, i) => ({
      url: `https://orium.dev/placeholder/image/-.png`,
      revised_prompt: data.prompt,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ created: Math.floor(Date.now() / 1000), data: images }));
  }

  private async handleImageEdits(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const data = JSON.parse(body);
    const n = data.n || 1;
    const images = Array.from({ length: n }, (_, i) => ({
      url: `https://orium.dev/placeholder/image-edit/-.png`,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ created: Math.floor(Date.now() / 1000), data: images }));
  }

  // =============================================================
  //  AUDIO
  // =============================================================

  private async handleAudioTranscriptions(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const data = JSON.parse(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      text: data.text || 'Transcribed text placeholder',
      task: 'transcribe',
      language: data.language || 'en',
      duration: 0,
      segments: [],
    }));
  }

  private async handleAudioSpeech(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const data = JSON.parse(body);
    res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
    res.end(Buffer.from('SUQzBAAAAAAAI1RTSVMAAAAPAAADTGF2ZjYwLjQuMTAwAAAAAAAAAAAAAA', 'base64'));
  }

  // =============================================================
  //  FILES
  // =============================================================

  private async handleUploadFile(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const data = JSON.parse(body);
    const fileId = 'file-' + Date.now();
    const content = data.content || '';
    const entry: FileEntry = {
      id: fileId,
      filename: data.filename || 'untitled',
      purpose: data.purpose || 'general',
      bytes: Buffer.byteLength(content),
      contentType: data.contentType || 'application/octet-stream',
      data: Buffer.from(content).toString('base64'),
      createdAt: Date.now(),
    };
    this.files.set(fileId, entry);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: fileId,
      object: 'file',
      bytes: entry.bytes,
      created_at: entry.createdAt,
      filename: entry.filename,
      purpose: entry.purpose,
    }));
  }

  private async handleListFiles(res: ServerResponse): Promise<void> {
    const files = Array.from(this.files.values()).map((f) => ({
      id: f.id,
      object: 'file',
      bytes: f.bytes,
      created_at: f.createdAt,
      filename: f.filename,
      purpose: f.purpose,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: files }));
  }

  private async handleGetFile(res: ServerResponse, fileId: string): Promise<void> {
    const file = this.files.get(fileId);
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'File not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: file.id,
      object: 'file',
      bytes: file.bytes,
      created_at: file.createdAt,
      filename: file.filename,
      purpose: file.purpose,
    }));
  }

  private async handleDeleteFile(res: ServerResponse, fileId: string): Promise<void> {
    const deleted = this.files.delete(fileId);
    if (!deleted) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'File not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: fileId, object: 'file', deleted: true }));
  }

  // =============================================================
  //  KNOWLEDGE BASES
  // =============================================================

  private async handleCreateKnowledgeBase(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const data = JSON.parse(body);
    const id = 'kb-' + Date.now();
    const kb: KnowledgeBase = {
      id,
      name: data.name || 'Untitled',
      description: data.description || '',
      documents: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.knowledgeBases.set(id, kb);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id, name: kb.name, description: kb.description, created_at: kb.createdAt }));
  }

  private async handleListKnowledgeBases(res: ServerResponse): Promise<void> {
    const list = Array.from(this.knowledgeBases.values()).map((kb) => ({
      id: kb.id,
      name: kb.name,
      description: kb.description,
      document_count: kb.documents.length,
      created_at: kb.createdAt,
      updated_at: kb.updatedAt,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: list }));
  }

  private async handleAddDocument(req: IncomingMessage, res: ServerResponse, kbId: string): Promise<void> {
    const kb = this.knowledgeBases.get(kbId);
    if (!kb) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Knowledge base not found' }));
      return;
    }
    const body = await this.readBody(req);
    const data = JSON.parse(body);
    const doc = {
      id: 'doc-' + Date.now(),
      content: data.content || '',
      metadata: data.metadata || {},
      createdAt: Date.now(),
    };
    kb.documents.push(doc);
    kb.updatedAt = Date.now();
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: doc.id, object: 'document', content: doc.content, metadata: doc.metadata }));
  }

  private async handleQueryKnowledgeBase(req: IncomingMessage, res: ServerResponse, kbId: string): Promise<void> {
    const kb = this.knowledgeBases.get(kbId);
    if (!kb) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Knowledge base not found' }));
      return;
    }
    const body = await this.readBody(req);
    const data = JSON.parse(body);
    const query = (data.query || '').toLowerCase();
    const results = kb.documents
      .filter((d) => d.content.toLowerCase().includes(query))
      .map((d) => ({ id: d.id, content: d.content, metadata: d.metadata, score: 1.0 }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: results }));
  }

  // =============================================================
  //  AGENTS
  // =============================================================

  private async handleCreateAgent(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const data = JSON.parse(body);
    const id = 'agent-' + Date.now();
    const agent: AgentDef = {
      id,
      name: data.name || 'Untitled Agent',
      description: data.description || '',
      model: data.model || 'gpt-4',
      systemPrompt: data.systemPrompt,
      tools: data.tools || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.agents.set(id, agent);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id, name: agent.name, description: agent.description, model: agent.model, created_at: agent.createdAt }));
  }

  private async handleListAgents(res: ServerResponse): Promise<void> {
    const list = Array.from(this.agents.values()).map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      model: a.model,
      created_at: a.createdAt,
      updated_at: a.updatedAt,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: list }));
  }

  private async handleGetAgent(res: ServerResponse, id: string): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Agent not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      model: agent.model,
      system_prompt: agent.systemPrompt,
      tools: agent.tools,
      created_at: agent.createdAt,
      updated_at: agent.updatedAt,
    }));
  }

  private async handleUpdateAgent(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Agent not found' }));
      return;
    }
    const body = await this.readBody(req);
    const data = JSON.parse(body);
    if (data.name !== undefined) agent.name = data.name;
    if (data.description !== undefined) agent.description = data.description;
    if (data.model !== undefined) agent.model = data.model;
    if (data.systemPrompt !== undefined) agent.systemPrompt = data.systemPrompt;
    if (data.tools !== undefined) agent.tools = data.tools;
    agent.updatedAt = Date.now();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      model: agent.model,
      system_prompt: agent.systemPrompt,
      tools: agent.tools,
      updated_at: agent.updatedAt,
    }));
  }

  private async handleDeleteAgent(res: ServerResponse, id: string): Promise<void> {
    const deleted = this.agents.delete(id);
    if (!deleted) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Agent not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id, object: 'agent', deleted: true }));
  }

  private async handleRunAgent(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Agent not found' }));
      return;
    }
    const body = await this.readBody(req);
    const data = JSON.parse(body);
    const adapter = this.getAdapter(data.adapter);
    if (!adapter) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Adapter not found' }));
      return;
    }
    const session = new ChatSession(adapter, {
      model: agent.model,
      systemPrompt: agent.systemPrompt,
    }, this.skillRegistry);
    const response = await session.send(data.message || '');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: response.id,
      object: 'agent.run',
      agent_id: id,
      role: response.role,
      content: response.content,
      model: response.model,
      usage: response.usage,
    }));
  }

  // =============================================================
  //  WORKFLOWS
  // =============================================================

  private async handleCreateWorkflow(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const data = JSON.parse(body);
    const id = 'wf-' + Date.now();
    const wf: WorkflowDef = {
      id,
      name: data.name || 'Untitled Workflow',
      description: data.description || '',
      nodes: data.nodes || [],
      edges: data.edges || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.workflows.set(id, wf);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id, name: wf.name, description: wf.description, created_at: wf.createdAt }));
  }

  private async handleListWorkflows(res: ServerResponse): Promise<void> {
    const list = Array.from(this.workflows.values()).map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      created_at: w.createdAt,
      updated_at: w.updatedAt,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: list }));
  }

  private async handleRunWorkflow(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    const wf = this.workflows.get(id);
    if (!wf) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Workflow not found' }));
      return;
    }
    const body = await this.readBody(req);
    const data = JSON.parse(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'wf-run-' + Date.now(),
      object: 'workflow.run',
      workflow_id: id,
      status: 'completed',
      inputs: data.inputs || {},
      outputs: { result: 'Workflow executed successfully' },
      created_at: Date.now(),
    }));
  }

  // =============================================================
  //  BATCHES
  // =============================================================

  private async handleCreateBatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const data = JSON.parse(body);
    const id = 'batch-' + Date.now();
    const batch: BatchJob = {
      id,
      endpoint: data.endpoint || '/v1/chat/completions',
      inputFileId: data.input_file_id || '',
      status: 'validating',
      requestCounts: { total: 0, completed: 0, failed: 0 },
      createdAt: Date.now(),
    };
    this.batches.set(id, batch);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: batch.id,
      object: 'batch',
      endpoint: batch.endpoint,
      input_file_id: batch.inputFileId,
      status: batch.status,
      request_counts: batch.requestCounts,
      created_at: batch.createdAt,
    }));
  }

  private async handleGetBatch(res: ServerResponse, id: string): Promise<void> {
    const batch = this.batches.get(id);
    if (!batch) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Batch not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: batch.id,
      object: 'batch',
      endpoint: batch.endpoint,
      input_file_id: batch.inputFileId,
      status: batch.status,
      output_file_id: batch.outputFileId,
      error_file_id: batch.errorFileId,
      request_counts: batch.requestCounts,
      created_at: batch.createdAt,
      completed_at: batch.completedAt,
    }));
  }

  // =============================================================
  //  STATUS
  // =============================================================

  private async handleStatus(res: ServerResponse): Promise<void> {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      version: '0.1.0',
      adapters: this.adapterRegistry.list().length,
      sessions: this.sessions.size,
      agents: this.agents.size,
      workflows: this.workflows.size,
      knowledge_bases: this.knowledgeBases.size,
      files: this.files.size,
      batches: this.batches.size,
    }));
  }
}
