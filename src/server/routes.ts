/**
 * Orium - Extended API Routes
 * OpenAI-compatible + Dify-inspired API endpoints
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { AdapterRegistry } from '../adapters/base.js';
import type { SkillRegistry } from '../skills/base.js';

// ── In-memory stores (replace with DB in production) ──
interface Agent {
  id: string;
  name: string;
  role: string;
  goal: string;
  backstory?: string;
  tools: string[];
  model?: string;
  adapter?: string;
  createdAt: string;
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: any[];
  edges: any[];
  variables: Record<string, any>;
  status: 'draft' | 'active' | 'archived';
  createdAt: string;
}

interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  documents: any[];
  embeddingModel?: string;
  createdAt: string;
}

interface FileRecord {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  content: string;
  createdAt: string;
}

interface BatchJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  requests: any[];
  responses: any[];
  createdAt: string;
  completedAt?: string;
}

const agents = new Map<string, Agent>();
const workflows = new Map<string, Workflow>();
const knowledgeBases = new Map<string, KnowledgeBase>();
const files = new Map<string, FileRecord>();
const batches = new Map<string, BatchJob>();

// ── Helper ──
function json(res: ServerResponse, status: number, data: any): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ── Models ──
export async function handleModels(
  req: IncomingMessage,
  res: ServerResponse,
  adapterRegistry: AdapterRegistry
): Promise<void> {
  const adapters = adapterRegistry.list();
  const models: any[] = [];

  for (const name of adapters) {
    const adapter = adapterRegistry.get(name);
    if (adapter) {
      for (const model of adapter.supportedModels) {
        models.push({
          id: `${name}/${model}`,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: name,
        });
      }
    }
  }

  json(res, 200, {
    object: 'list',
    data: models,
  });
}

export async function handleModelDetail(
  req: IncomingMessage,
  res: ServerResponse,
  adapterRegistry: AdapterRegistry,
  modelId: string
): Promise<void> {
  const [adapterName, modelName] = modelId.split('/');
  const adapter = adapterRegistry.get(adapterName);

  if (!adapter || !adapter.supportedModels.includes(modelName || '')) {
    json(res, 404, { error: 'Model not found' });
    return;
  }

  json(res, 200, {
    id: modelId,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: adapterName,
  });
}

// ── Embeddings ──
export async function handleEmbeddings(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const body = await readBody(req);
  const data = JSON.parse(body);

  const input = Array.isArray(data.input) ? data.input : [data.input];
  const embeddings = input.map((text: string, i: number) => ({
    object: 'embedding',
    index: i,
    embedding: Array.from({ length: 1536 }, () => (Math.random() - 0.5) * 0.02),
  }));

  json(res, 200, {
    object: 'list',
    data: embeddings,
    model: data.model || 'text-embedding-3-small',
    usage: {
      prompt_tokens: input.join('').length,
      total_tokens: input.join('').length,
    },
  });
}

// ── Images ──
export async function handleImageGenerations(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const body = await readBody(req);
  const data = JSON.parse(body);

  json(res, 200, {
    created: Math.floor(Date.now() / 1000),
    data: [{
      url: `https://picsum.photos/seed/${Date.now()}/1024/1024`,
      revised_prompt: data.prompt,
    }],
  });
}

export async function handleImageEdits(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  json(res, 200, {
    created: Math.floor(Date.now() / 1000),
    data: [{
      url: `https://picsum.photos/seed/edit${Date.now()}/1024/1024`,
    }],
  });
}

// ── Audio ──
export async function handleAudioTranscriptions(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  json(res, 200, {
    text: 'This is a simulated transcription result. In production, this would use Whisper or similar STT service.',
  });
}

export async function handleAudioSpeech(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const body = await readBody(req);
  const data = JSON.parse(body);

  // Return a simulated audio URL
  json(res, 200, {
    url: `data:audio/mp3;base64,SIMULATED_AUDIO_DATA_FOR_${encodeURIComponent(data.input || 'text')}`,
  });
}

// ── Files ──
export async function handleFilesList(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const fileList = Array.from(files.values()).map((f) => ({
    id: f.id,
    object: 'file',
    bytes: f.size,
    created_at: Math.floor(new Date(f.createdAt).getTime() / 1000),
    filename: f.filename,
    purpose: 'assistants',
    status: 'processed',
  }));

  json(res, 200, {
    object: 'list',
    data: fileList,
  });
}

export async function handleFileUpload(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const body = await readBody(req);
  // In production, parse multipart form data
  const id = `file-${Date.now()}`;
  const file: FileRecord = {
    id,
    filename: 'uploaded-file.txt',
    size: body.length,
    mimeType: 'text/plain',
    content: body,
    createdAt: new Date().toISOString(),
  };
  files.set(id, file);

  json(res, 201, {
    id,
    object: 'file',
    bytes: body.length,
    created_at: Math.floor(Date.now() / 1000),
    filename: file.filename,
    purpose: 'assistants',
    status: 'processed',
  });
}

export async function handleFileGet(
  req: IncomingMessage,
  res: ServerResponse,
  fileId: string
): Promise<void> {
  const file = files.get(fileId);
  if (!file) {
    json(res, 404, { error: 'File not found' });
    return;
  }

  json(res, 200, {
    id: file.id,
    object: 'file',
    bytes: file.size,
    created_at: Math.floor(new Date(file.createdAt).getTime() / 1000),
    filename: file.filename,
    purpose: 'assistants',
    status: 'processed',
  });
}

export async function handleFileDelete(
  req: IncomingMessage,
  res: ServerResponse,
  fileId: string
): Promise<void> {
  const deleted = files.delete(fileId);
  json(res, 200, {
    id: fileId,
    object: 'file',
    deleted,
  });
}

// ── Knowledge Bases ──
export async function handleKnowledgeBasesList(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const list = Array.from(knowledgeBases.values()).map((kb) => ({
    id: kb.id,
    name: kb.name,
    description: kb.description,
    document_count: kb.documents.length,
    embedding_model: kb.embeddingModel,
    created_at: kb.createdAt,
  }));

  json(res, 200, { knowledge_bases: list });
}

export async function handleKnowledgeBaseCreate(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const body = await readBody(req);
  const data = JSON.parse(body);

  const id = `kb-${Date.now()}`;
  const kb: KnowledgeBase = {
    id,
    name: data.name,
    description: data.description,
    documents: [],
    embeddingModel: data.embedding_model || 'text-embedding-3-small',
    createdAt: new Date().toISOString(),
  };
  knowledgeBases.set(id, kb);

  json(res, 201, {
    id,
    name: kb.name,
    description: kb.description,
    document_count: 0,
    embedding_model: kb.embeddingModel,
    created_at: kb.createdAt,
  });
}

export async function handleKnowledgeBaseAddDoc(
  req: IncomingMessage,
  res: ServerResponse,
  kbId: string
): Promise<void> {
  const kb = knowledgeBases.get(kbId);
  if (!kb) {
    json(res, 404, { error: 'Knowledge base not found' });
    return;
  }

  const body = await readBody(req);
  const data = JSON.parse(body);

  const doc = {
    id: `doc-${Date.now()}`,
    content: data.content,
    metadata: data.metadata || {},
    created_at: new Date().toISOString(),
  };
  kb.documents.push(doc);

  json(res, 201, {
    id: doc.id,
    knowledge_base_id: kbId,
    status: 'processed',
  });
}

export async function handleKnowledgeBaseQuery(
  req: IncomingMessage,
  res: ServerResponse,
  kbId: string
): Promise<void> {
  const kb = knowledgeBases.get(kbId);
  if (!kb) {
    json(res, 404, { error: 'Knowledge base not found' });
    return;
  }

  const body = await readBody(req);
  const data = JSON.parse(body);
  const query = data.query?.toLowerCase() || '';

  // Simple keyword search (replace with vector search in production)
  const results = kb.documents
    .filter((d) => d.content.toLowerCase().includes(query))
    .map((d) => ({
      document_id: d.id,
      content: d.content.substring(0, 500),
      score: 0.85,
      metadata: d.metadata,
    }));

  json(res, 200, {
    knowledge_base_id: kbId,
    query: data.query,
    results,
  });
}

// ── Agents ──
export async function handleAgentsList(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const list = Array.from(agents.values()).map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    goal: a.goal,
    tools: a.tools,
    model: a.model,
    adapter: a.adapter,
    created_at: a.createdAt,
  }));

  json(res, 200, { agents: list });
}

export async function handleAgentCreate(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const body = await readBody(req);
  const data = JSON.parse(body);

  const id = `agent-${Date.now()}`;
  const agent: Agent = {
    id,
    name: data.name,
    role: data.role || 'assistant',
    goal: data.goal || '',
    backstory: data.backstory,
    tools: data.tools || [],
    model: data.model,
    adapter: data.adapter,
    createdAt: new Date().toISOString(),
  };
  agents.set(id, agent);

  json(res, 201, {
    id,
    name: agent.name,
    role: agent.role,
    goal: agent.goal,
    tools: agent.tools,
    created_at: agent.createdAt,
  });
}

export async function handleAgentGet(
  req: IncomingMessage,
  res: ServerResponse,
  agentId: string
): Promise<void> {
  const agent = agents.get(agentId);
  if (!agent) {
    json(res, 404, { error: 'Agent not found' });
    return;
  }

  json(res, 200, {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    goal: agent.goal,
    backstory: agent.backstory,
    tools: agent.tools,
    model: agent.model,
    adapter: agent.adapter,
    created_at: agent.createdAt,
  });
}

export async function handleAgentUpdate(
  req: IncomingMessage,
  res: ServerResponse,
  agentId: string
): Promise<void> {
  const agent = agents.get(agentId);
  if (!agent) {
    json(res, 404, { error: 'Agent not found' });
    return;
  }

  const body = await readBody(req);
  const data = JSON.parse(body);

  Object.assign(agent, {
    name: data.name ?? agent.name,
    role: data.role ?? agent.role,
    goal: data.goal ?? agent.goal,
    backstory: data.backstory ?? agent.backstory,
    tools: data.tools ?? agent.tools,
    model: data.model ?? agent.model,
    adapter: data.adapter ?? agent.adapter,
  });

  json(res, 200, {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    goal: agent.goal,
    tools: agent.tools,
    created_at: agent.createdAt,
  });
}

export async function handleAgentDelete(
  req: IncomingMessage,
  res: ServerResponse,
  agentId: string
): Promise<void> {
  const deleted = agents.delete(agentId);
  json(res, 200, { id: agentId, deleted });
}

export async function handleAgentRun(
  req: IncomingMessage,
  res: ServerResponse,
  agentId: string
): Promise<void> {
  const agent = agents.get(agentId);
  if (!agent) {
    json(res, 404, { error: 'Agent not found' });
    return;
  }

  const body = await readBody(req);
  const data = JSON.parse(body);

  json(res, 200, {
    agent_id: agentId,
    status: 'completed',
    result: {
      message: `Agent "${agent.name}" executed task: ${data.task || 'default'}`,
      output: 'Simulated agent execution result.',
    },
  });
}

// ── Workflows ──
export async function handleWorkflowsList(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const list = Array.from(workflows.values()).map((w) => ({
    id: w.id,
    name: w.name,
    description: w.description,
    node_count: w.nodes.length,
    status: w.status,
    created_at: w.createdAt,
  }));

  json(res, 200, { workflows: list });
}

export async function handleWorkflowCreate(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const body = await readBody(req);
  const data = JSON.parse(body);

  const id = `wf-${Date.now()}`;
  const workflow: Workflow = {
    id,
    name: data.name,
    description: data.description,
    nodes: data.nodes || [],
    edges: data.edges || [],
    variables: data.variables || {},
    status: 'draft',
    createdAt: new Date().toISOString(),
  };
  workflows.set(id, workflow);

  json(res, 201, {
    id,
    name: workflow.name,
    description: workflow.description,
    node_count: workflow.nodes.length,
    status: workflow.status,
    created_at: workflow.createdAt,
  });
}

export async function handleWorkflowRun(
  req: IncomingMessage,
  res: ServerResponse,
  workflowId: string
): Promise<void> {
  const workflow = workflows.get(workflowId);
  if (!workflow) {
    json(res, 404, { error: 'Workflow not found' });
    return;
  }

  const body = await readBody(req);
  const data = JSON.parse(body);

  json(res, 200, {
    workflow_id: workflowId,
    run_id: `run-${Date.now()}`,
    status: 'completed',
    result: {
      output: `Workflow "${workflow.name}" executed with ${workflow.nodes.length} nodes.`,
      variables: data.variables || {},
    },
  });
}

// ── Batches ──
export async function handleBatchCreate(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const body = await readBody(req);
  const data = JSON.parse(body);

  const id = `batch-${Date.now()}`;
  const job: BatchJob = {
    id,
    status: 'pending',
    requests: data.requests || [],
    responses: [],
    createdAt: new Date().toISOString(),
  };
  batches.set(id, job);

  // Simulate async processing
  setTimeout(() => {
    job.status = 'running';
    setTimeout(() => {
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.responses = job.requests.map((req: any, i: number) => ({
        index: i,
        status: 'success',
        result: { message: `Processed: ${JSON.stringify(req).substring(0, 100)}` },
      }));
    }, 2000);
  }, 100);

  json(res, 201, {
    id,
    object: 'batch',
    endpoint: data.endpoint || '/v1/chat/completions',
    input_file_id: data.input_file_id,
    status: 'pending',
    created_at: Math.floor(Date.now() / 1000),
  });
}

export async function handleBatchGet(
  req: IncomingMessage,
  res: ServerResponse,
  batchId: string
): Promise<void> {
  const job = batches.get(batchId);
  if (!job) {
    json(res, 404, { error: 'Batch not found' });
    return;
  }

  json(res, 200, {
    id: job.id,
    object: 'batch',
    endpoint: '/v1/chat/completions',
    status: job.status,
    created_at: Math.floor(new Date(job.createdAt).getTime() / 1000),
    completed_at: job.completedAt ? Math.floor(new Date(job.completedAt).getTime() / 1000) : null,
    request_counts: {
      total: job.requests.length,
      completed: job.responses.length,
      failed: 0,
    },
  });
}

// ── Status ──
export async function handleStatus(
  req: IncomingMessage,
  res: ServerResponse,
  adapterRegistry: AdapterRegistry
): Promise<void> {
  json(res, 200, {
    status: 'healthy',
    version: '0.2.0',
    timestamp: new Date().toISOString(),
    adapters: {
      total: adapterRegistry.list().length,
      registered: adapterRegistry.list(),
    },
    features: {
      chat: true,
      streaming: true,
      tools: true,
      agents: true,
      workflows: true,
      knowledge_bases: true,
      files: true,
      batches: true,
      embeddings: true,
      images: true,
      audio: true,
    },
  });
}

// ── Tools (enhanced) ──
export async function handleToolsList(
  req: IncomingMessage,
  res: ServerResponse,
  skillRegistry?: SkillRegistry
): Promise<void> {
  const tools = skillRegistry?.getAllTools().map((t) => ({
    name: t.schema.name,
    description: t.schema.description,
    parameters: t.schema.parameters,
  })) || [];

  json(res, 200, { tools });
}
