/**
 * Orium - Embedding / Vector Service
 * Unified interface for text embedding APIs.
 */

export interface EmbeddingRequest {
  input: string | string[];
  model?: string;
  dimensions?: number; // for truncation
  encodingFormat?: 'float' | 'base64';
  user?: string;
}

export interface EmbeddingResponse {
  id: string;
  embeddings: Array<{
    embedding: number[];
    index: number;
    object: string;
  }>;
  model: string;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

export interface SimilarityRequest {
  texts: string[];
  query: string;
  model?: string;
  topK?: number;
}

export interface SimilarityResponse {
  results: Array<{
    text: string;
    index: number;
    score: number;
  }>;
}

export abstract class EmbeddingService {
  abstract readonly name: string;
  abstract readonly supportedModels: string[];
  abstract readonly dimensions: number;

  abstract embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  abstract healthCheck(): Promise<boolean>;

  // Utility: cosine similarity
  cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Utility: semantic search
  async similarity(request: SimilarityRequest): Promise<SimilarityResponse> {
    const allTexts = [request.query, ...request.texts];
    const embeddings = await this.embed({ input: allTexts, model: request.model });
    const queryEmbedding = embeddings.embeddings[0].embedding;

    const results = embeddings.embeddings
      .slice(1)
      .map((e, i) => ({
        text: request.texts[i],
        index: i,
        score: this.cosineSimilarity(queryEmbedding, e.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, request.topK || 5);

    return { results };
  }
}

// === OpenAI Embedding ===

export class OpenAIEmbeddingService extends EmbeddingService {
  readonly name = 'openai-embedding';
  readonly supportedModels = ['text-embedding-3-large', 'text-embedding-3-small', 'text-embedding-ada-002'];
  readonly dimensions = 3072;

  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'text-embedding-3-large',
        input: request.input,
        dimensions: request.dimensions,
        encoding_format: request.encodingFormat || 'float',
        user: request.user,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI embedding error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: `openai-emb-${Date.now()}`,
      embeddings: data.data,
      model: data.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Cohere Embedding ===

export class CohereEmbeddingService extends EmbeddingService {
  readonly name = 'cohere-embedding';
  readonly supportedModels = ['embed-english-v3.0', 'embed-multilingual-v3.0', 'embed-english-light-v3.0'];
  readonly dimensions = 1024;

  private apiKey: string;
  private baseUrl = 'https://api.cohere.com/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const res = await fetch(`${this.baseUrl}/embed`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'embed-multilingual-v3.0',
        texts: Array.isArray(request.input) ? request.input : [request.input],
        input_type: 'search_document',
        embedding_types: ['float'],
      }),
    });

    if (!res.ok) {
      throw new Error(`Cohere embedding error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: `cohere-emb-${Date.now()}`,
      embeddings: data.embeddings?.float?.map((e: number[], i: number) => ({
        embedding: e,
        index: i,
        object: 'embedding',
      })) || [],
      model: request.model || 'embed-multilingual-v3.0',
      usage: {
        promptTokens: data.meta?.billed_units?.input_tokens || 0,
        totalTokens: data.meta?.billed_units?.input_tokens || 0,
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Jina AI Embedding (free tier available) ===

export class JinaEmbeddingService extends EmbeddingService {
  readonly name = 'jina-embedding';
  readonly supportedModels = ['jina-embeddings-v3', 'jina-embeddings-v2-base-en', 'jina-embeddings-v2-base-zh'];
  readonly dimensions = 768;

  private apiKey: string;
  private baseUrl = 'https://api.jina.ai/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'jina-embeddings-v3',
        input: request.input,
      }),
    });

    if (!res.ok) {
      throw new Error(`Jina embedding error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: `jina-emb-${Date.now()}`,
      embeddings: data.data,
      model: data.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Mistral Embedding ===

export class MistralEmbeddingService extends EmbeddingService {
  readonly name = 'mistral-embedding';
  readonly supportedModels = ['mistral-embed'];
  readonly dimensions = 1024;

  private apiKey: string;
  private baseUrl = 'https://api.mistral.ai/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'mistral-embed',
        input: request.input,
        encoding_format: request.encodingFormat || 'float',
      }),
    });

    if (!res.ok) {
      throw new Error(`Mistral embedding error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: `mistral-emb-${Date.now()}`,
      embeddings: data.data,
      model: data.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Google Vertex Embedding ===

export class VertexEmbeddingService extends EmbeddingService {
  readonly name = 'vertex-embedding';
  readonly supportedModels = ['text-embedding-004', 'text-multilingual-embedding-002'];
  readonly dimensions = 768;

  private apiKey: string;
  private projectId: string;
  private baseUrl: string;

  constructor(apiKey: string, projectId: string, location = 'us-central1') {
    super();
    this.apiKey = apiKey;
    this.projectId = projectId;
    this.baseUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}`;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = request.model || 'text-embedding-004';
    const inputs = Array.isArray(request.input) ? request.input : [request.input];

    const res = await fetch(
      `${this.baseUrl}/publishers/google/models/${model}:predict?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: inputs.map((text) => ({ content: text })),
          parameters: {
            outputDimensionality: request.dimensions || this.dimensions,
          },
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Vertex embedding error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: `vertex-emb-${Date.now()}`,
      embeddings: data.predictions?.map((p: any, i: number) => ({
        embedding: p.embeddings?.values || [],
        index: i,
        object: 'embedding',
      })) || [],
      model,
      usage: { promptTokens: 0, totalTokens: 0 },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models?key=${this.apiKey}`);
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Baidu Qianfan Embedding ===

export class BaiduEmbeddingService extends EmbeddingService {
  readonly name = 'baidu-embedding';
  readonly supportedModels = ['embedding-v1', 'bge-large-zh', 'tao-8k'];
  readonly dimensions = 384;

  private apiKey: string;
  private secretKey: string;
  private accessToken?: string;
  private baseUrl = 'https://aip.baidubce.com';

  constructor(apiKey: string, secretKey: string) {
    super();
    this.apiKey = apiKey;
    this.secretKey = secretKey;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    const res = await fetch(
      `${this.baseUrl}/oauth/2.0/token?grant_type=client_credentials&client_id=${this.apiKey}&client_secret=${this.secretKey}`
    );
    const data = await res.json();
    this.accessToken = data.access_token;
    return this.accessToken!;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const token = await this.getAccessToken();
    const inputs = Array.isArray(request.input) ? request.input : [request.input];

    const res = await fetch(
      `${this.baseUrl}/rpc/2.0/ai_custom/v1/wenxinworkshop/embedding/${request.model || 'embedding-v1'}?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: inputs }),
      }
    );

    if (!res.ok) {
      throw new Error(`Baidu embedding error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: `baidu-emb-${Date.now()}`,
      embeddings: data.data?.map((d: any, i: number) => ({
        embedding: d.embedding,
        index: i,
        object: 'embedding',
      })) || [],
      model: request.model || 'embedding-v1',
      usage: { promptTokens: 0, totalTokens: 0 },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.getAccessToken();
      return true;
    } catch {
      return false;
    }
  }
}

// === Service Registry ===

export class EmbeddingServiceRegistry {
  private services: Map<string, EmbeddingService> = new Map();

  register(service: EmbeddingService): void {
    this.services.set(service.name, service);
  }

  get(name: string): EmbeddingService | undefined {
    return this.services.get(name);
  }

  list(): string[] {
    return Array.from(this.services.keys());
  }
}

export const embeddingServices = new EmbeddingServiceRegistry();
