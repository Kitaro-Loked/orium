/**
 * Orium - HTTP Server
 * REST API for chat, adapters, skills, and services.
 * Now with input validation, better error handling, and UI diagnostics.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { URL } from 'url';
import type { AdapterRegistry, ModelAdapter } from '../adapters/base';
import { ChatSession } from '../chat/session';
import type { SkillRegistry } from '../skills/base';
import { serveUI, diagnoseUI } from '../ui/index';
import { logger } from '../utils/logger';

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
    // UI diagnostics on startup
    const diagnosis = diagnoseUI();
    if (diagnosis.status !== 'ok') {
      logger.warn('UI diagnostics:', diagnosis);
    } else {
      logger.info('UI ready:', { v3: diagnosis.paths['UI V3 Index']?.exists });
    }

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
        logger.error('Request handler error', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      });
    });

    server.listen(this.port, this.host, () => {
      logger.info(`Orium server running on http://${this.host}:${this.port}`);
      logger.info(`Web UI available at http://${this.host}:${this.port}/ui/v3`);
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Serve UI static files
    if (serveUI(req, res)) return;

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;
    const method = req.method || 'GET';

    logger.debug(`${method} ${path}`);

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
      await this.handleCreateSession(req, res);
      return;
    }

    if (path.startsWith('/v1/sessions/') && path.endsWith('/messages') && method === 'POST') {
      await this.handleSessionMessage(req, res, path);
      return;
    }

    if (path.startsWith('/v1/sessions/') && path.endsWith('/history') && method === 'GET') {
      await this.handleSessionHistory(req, res, path);
      return;
    }

    if (path === '/v1/tools/execute' && method === 'POST') {
      await this.handleToolExecute(req, res);
      return;
    }

    // NEW ENDPOINTS
    if (path === '/v1/models' && method === 'GET') {
      await this.handleListModels(res);
      return;
    }

    const modelsMatch = path.match(/^\/v1\/models\/([^/]+)$/);
    if (modelsMatch && method === 'GET') {
      await this.handleGetModel(res, modelsMatch[1]);
      return;
    }

    if (path === '/v1/embeddings' && method === 'POST') {
      await this.handleEmbeddings(req, res);
      return;
    }

    if (path === '/v1/images/generations' && method === 'POST') {
      await this.handleImageGenerations(req, res);
      return;
    }

    if (path === '/v1/images/edits' && method === 'POST') {
      await this.handleImageEdits(req, res);
      return;
    }

    if (path === '/v1/audio/transcriptions' && method === 'POST') {
      await this.handleAudioTranscriptions(req, res);
      return;
    }

    if (path === '/v1/audio/speech' && method === 'POST') {
      await this.handleAudioSpeech(req, res);
      return;
    }

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

    if (path === '/v1/batches' && method === 'POST') {
      await this.handleCreateBatch(req, res);
      return;
    }

    const batchMatch = path.match(/^\/v1\/batches\/([^/]+)$/);
    if (batchMatch && method === 'GET') {
      await this.handleGetBatch(res, batchMatch[1]);
      return;
    }

    if (path === '/v1/status' && method === 'GET') {
      await this.handleStatus(res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  // ── Chat Completion ─────────────────────────────────────────────

  private async handleChatCompletion(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const adapter = this.getAdapter(String(data.adapter || ''));
    if (!adapter) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Adapter not found' }));
      return;
    }

    const session = new ChatSession(adapter, {
      model: String(data.model || ''),
      temperature: typeof data.temperature === 'number' ? data.temperature : undefined,
      maxTokens: typeof data.max_tokens === 'number' ? data.max_tokens : undefined,
    }, this.skillRegistry);

    const messages = Array.isArray(data.messages) ? data.messages : [];
    for (const msg of messages) {
      if (msg && typeof msg === 'object' && msg.role === 'system') {
        session.setSystemPrompt(String(msg.content || ''));
      }
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Last message must be from user' }));
      return;
    }

    try {
      const response = await session.send(String(lastMessage.content || ''));
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
    } catch (err) {
      logger.error('Chat completion failed', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Completion failed', details: String(err) }));
    }
  }

  // ── Session Handlers ────────────────────────────────────────────

  private async handleCreateSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const sessionId = `sess-${Date.now()}`;
    const adapter = this.getAdapter(String(data.adapter || this.defaultAdapter || ''));

    if (!adapter) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Adapter not found' }));
      return;
    }

    const session = new ChatSession(adapter, {
      model: String(data.model || ''),
      systemPrompt: String(data.systemPrompt || ''),
      temperature: typeof data.temperature === 'number' ? data.temperature : undefined,
    }, this.skillRegistry);

    this.sessions.set(sessionId, session);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sessionId, adapter: adapter.name }));
  }

  private async handleSessionMessage(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    const sessionId = path.split('/')[3];
    const session = this.sessions.get(sessionId);

    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }

    const body = await this.readBody(req);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    try {
      const response = await session.send(String(data.message || ''), data.imageUrl ? String(data.imageUrl) : undefined);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: response.id,
        role: response.role,
        content: response.content,
        model: response.model,
        usage: response.usage,
        toolCalls: response.toolCalls,
      }));
    } catch (err) {
      logger.error('Session message failed', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Message failed', details: String(err) }));
    }
  }

  private async handleSessionHistory(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    const sessionId = path.split('/')[3];
    const session = this.sessions.get(sessionId);

    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messages: session.getHistory() }));
  }

  private async handleToolExecute(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    if (!this.skillRegistry) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Skill registry not available' }));
      return;
    }

    try {
      const tools = this.skillRegistry.getAllTools();
      const toolName = String(data.tool || '');
      const tool = tools.find((t) => t.schema.name === toolName);
      if (!tool) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Tool not found: ${toolName}` }));
        return;
      }

      const result = await tool.handler((data.arguments || {}) as Record<string, unknown>);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result }));
    } catch (err) {
      logger.error('Tool execution failed', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err) }));
    }
  }

  // ── Models ──────────────────────────────────────────────────────

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

  // ── Embeddings ──────────────────────────────────────────────────

  private async handleEmbeddings(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const input = data.input;
    const model = String(data.model || 'text-embedding-ada-002');
    const inputs = Array.isArray(input) ? input : [input];
    const embeddings = (inputs as string[]).map((text: string, index: number) => ({
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

  // ── Images ──────────────────────────────────────────────────────

  private async handleImageGenerations(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const n = typeof data.n === 'number' ? data.n : 1;
    const images = Array.from({ length: n }, () => ({
      url: `https://orium.dev/placeholder/image/-.png`,
      revised_prompt: String(data.prompt || ''),
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ created: Math.floor(Date.now() / 1000), data: images }));
  }

  private async handleImageEdits(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const n = typeof data.n === 'number' ? data.n : 1;
    const images = Array.from({ length: n }, () => ({
      url: `https://orium.dev/placeholder/image-edit/-.png`,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ created: Math.floor(Date.now() / 1000), data: images }));
  }

  // ── Audio ───────────────────────────────────────────────────────

  private async handleAudioTranscriptions(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      text: String(data.text || 'Transcribed text placeholder'),
      task: 'transcribe',
      language: String(data.language || 'en'),
      duration: 0,
      segments: [],
    }));
  }

  private async handleAudioSpeech(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
    res.end(Buffer.from('SUQzBAAAAAAAI1RTSVMAAAAPAAADTGF2ZjYwLjQuMTAwAAAAAAAAAAAAAA', 'base64'));
  }

  // ── Files ───────────────────────────────────────────────────────

  private async handleUploadFile(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const fileId = 'file-' + Date.now();
    const content = String(data.content || '');
    const entry: FileEntry = {
      id: fileId,
      filename: String(data.filename || 'untitled'),
      purpose: String(data.purpose || 'general'),
      bytes: Buffer.byteLength(content),
      contentType: String(data.contentType || 'application/octet-stream'),
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

  // ── Knowledge Bases ─────────────────────────────────────────────

  private async handleCreateKnowledgeBase(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const id = 'kb-' + Date.now();
    const kb: KnowledgeBase = {
      id,
      name: String(data.name || 'Untitled'),
      description: String(data.description || ''),
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
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const doc = {
      id: 'doc-' + Date.now(),
      content: String(data.content || ''),
      metadata: (data.metadata || {}) as Record<string, unknown>,
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
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const query = String(data.query || '').toLowerCase();
    const results = kb.documents
      .filter((d) => d.content.toLowerCase().includes(query))
      .map((d) => ({ id: d.id, content: d.content, metadata: d.metadata, score: 1.0 }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: results }));
  }

  // ── Agents ──────────────────────────────────────────────────────

  private async handleCreateAgent(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const id = 'agent-' + Date.now();
    const agent: AgentDef = {
      id,
      name: String(data.name || 'Untitled Agent'),
      description: String(data.description || ''),
      model: String(data.model || 'gpt-4'),
      systemPrompt: data.systemPrompt ? String(data.systemPrompt) : undefined,
      tools: Array.isArray(data.tools) ? data.tools.map(String) : [],
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
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    if (data.name !== undefined) agent.name = String(data.name);
    if (data.description !== undefined) agent.description = String(data.description);
    if (data.model !== undefined) agent.model = String(data.model);
    if (data.systemPrompt !== undefined) agent.systemPrompt = String(data.systemPrompt);
    if (data.tools !== undefined) agent.tools = Array.isArray(data.tools) ? data.tools.map(String) : [];
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
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const adapter = this.getAdapter(String(data.adapter || ''));
    if (!adapter) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Adapter not found' }));
      return;
    }

    try {
      const session = new ChatSession(adapter, {
        model: agent.model,
        systemPrompt: agent.systemPrompt,
      }, this.skillRegistry);
      const response = await session.send(String(data.message || ''));
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
    } catch (err) {
      logger.error('Agent run failed', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Agent run failed', details: String(err) }));
    }
  }

  // ── Workflows ───────────────────────────────────────────────────

  private async handleCreateWorkflow(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const id = 'wf-' + Date.now();
    const wf: WorkflowDef = {
      id,
      name: String(data.name || 'Untitled Workflow'),
      description: String(data.description || ''),
      nodes: Array.isArray(data.nodes) ? data.nodes : [],
      edges: Array.isArray(data.edges) ? data.edges : [],
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
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

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

  // ── Batches ─────────────────────────────────────────────────────

  private async handleCreateBatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const id = 'batch-' + Date.now();
    const batch: BatchJob = {
      id,
      endpoint: String(data.endpoint || '/v1/chat/completions'),
      inputFileId: String(data.input_file_id || ''),
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

  // ── Status ──────────────────────────────────────────────────────

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

  // ── Helpers ─────────────────────────────────────────────────────

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
