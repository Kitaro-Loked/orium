/**
 * Orium - RAG (Retrieval-Augmented Generation) Service
 * Unified interface for vector databases and retrieval systems.
 */

export interface Document {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

export interface IndexRequest {
  documents: Document[];
  collection?: string;
  embeddings?: number[][]; // pre-computed embeddings
}

export interface IndexResponse {
  ids: string[];
  count: number;
}

export interface SearchRequest {
  query: string;
  queryEmbedding?: number[];
  collection?: string;
  topK?: number;
  filter?: Record<string, unknown>;
  threshold?: number; // similarity threshold
}

export interface SearchResponse {
  results: Array<{
    document: Document;
    score: number;
    rank: number;
  }>;
}

export interface DeleteRequest {
  ids: string[];
  collection?: string;
}

export abstract class RAGService {
  abstract readonly name: string;

  abstract index(request: IndexRequest): Promise<IndexResponse>;
  abstract search(request: SearchRequest): Promise<SearchResponse>;
  abstract healthCheck(): Promise<boolean>;

  delete?(request: DeleteRequest): Promise<void> {
    throw new Error('Delete not supported by this service');
  }
}

// === ChromaDB ===

export class ChromaService extends RAGService {
  readonly name = 'chroma';

  private baseUrl: string;
  private tenant?: string;
  private database?: string;

  constructor(baseUrl = 'http://localhost:8000', tenant = 'default_tenant', database = 'default_database') {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.tenant = tenant;
    this.database = database;
  }

  async index(request: IndexRequest): Promise<IndexResponse> {
    const collection = request.collection || 'default';

    // Create collection if not exists
    await fetch(`${this.baseUrl}/api/v2/tenants/${this.tenant}/databases/${this.database}/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: collection,
        configuration: { 'hnsw:space': 'cosine' },
      }),
    });

    // Add documents
    const res = await fetch(
      `${this.baseUrl}/api/v2/tenants/${this.tenant}/databases/${this.database}/collections/${collection}/upsert`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: request.documents.map((d) => d.id),
          documents: request.documents.map((d) => d.content),
          metadatas: request.documents.map((d) => d.metadata || {}),
          embeddings: request.embeddings,
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Chroma error: ${res.status} ${await res.text()}`);
    }

    return {
      ids: request.documents.map((d) => d.id),
      count: request.documents.length,
    };
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    const collection = request.collection || 'default';

    const res = await fetch(
      `${this.baseUrl}/api/v2/tenants/${this.tenant}/databases/${this.database}/collections/${collection}/query`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_embeddings: request.queryEmbedding ? [request.queryEmbedding] : undefined,
          query_texts: request.queryEmbedding ? undefined : [request.query],
          n_results: request.topK || 5,
          where: request.filter,
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Chroma search error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const results = data.ids?.[0]?.map((id: string, i: number) => ({
      document: {
        id,
        content: data.documents?.[0]?.[i] || '',
        metadata: data.metadatas?.[0]?.[i] || {},
      },
      score: 1 - (data.distances?.[0]?.[i] || 0), // convert distance to similarity
      rank: i + 1,
    })) || [];

    return { results };
  }

  async delete(request: DeleteRequest): Promise<void> {
    const collection = request.collection || 'default';

    await fetch(
      `${this.baseUrl}/api/v2/tenants/${this.tenant}/databases/${this.database}/collections/${collection}/delete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: request.ids }),
      }
    );
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v2/heartbeat`);
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Pinecone ===

export class PineconeService extends RAGService {
  readonly name = 'pinecone';

  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, indexHost?: string) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = indexHost || '';
  }

  async index(request: IndexRequest): Promise<IndexResponse> {
    const vectors = request.documents.map((doc, i) => ({
      id: doc.id,
      values: request.embeddings?.[i] || doc.embedding || [],
      metadata: { text: doc.content, ...(doc.metadata || {}) },
    }));

    const res = await fetch(`${this.baseUrl}/vectors/upsert`, {
      method: 'POST',
      headers: {
        'Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ vectors, namespace: request.collection }),
    });

    if (!res.ok) {
      throw new Error(`Pinecone error: ${res.status} ${await res.text()}`);
    }

    return {
      ids: request.documents.map((d) => d.id),
      count: request.documents.length,
    };
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    const res = await fetch(`${this.baseUrl}/query`, {
      method: 'POST',
      headers: {
        'Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vector: request.queryEmbedding,
        topK: request.topK || 5,
        filter: request.filter,
        namespace: request.collection,
        includeMetadata: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Pinecone search error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const results = data.matches?.map((match: any, i: number) => ({
      document: {
        id: match.id,
        content: match.metadata?.text || '',
        metadata: match.metadata || {},
      },
      score: match.score,
      rank: i + 1,
    })) || [];

    return { results };
  }

  async delete(request: DeleteRequest): Promise<void> {
    await fetch(`${this.baseUrl}/vectors/delete`, {
      method: 'POST',
      headers: {
        'Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: request.ids, namespace: request.collection }),
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch('https://api.pinecone.io/indexes', {
        headers: { 'Api-Key': this.apiKey },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Qdrant ===

export class QdrantService extends RAGService {
  readonly name = 'qdrant';

  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl = 'http://localhost:6333', apiKey?: string) {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['api-key'] = this.apiKey;
    return headers;
  }

  async index(request: IndexRequest): Promise<IndexResponse> {
    const collection = request.collection || 'default';

    // Create collection if not exists
    await fetch(`${this.baseUrl}/collections/${collection}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({
        vectors: {
          size: request.embeddings?.[0]?.length || 1536,
          distance: 'Cosine',
        },
      }),
    });

    // Upsert points
    const points = request.documents.map((doc, i) => ({
      id: doc.id,
      vector: request.embeddings?.[i] || doc.embedding || [],
      payload: { text: doc.content, ...(doc.metadata || {}) },
    }));

    const res = await fetch(`${this.baseUrl}/collections/${collection}/points?wait=true`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({ points }),
    });

    if (!res.ok) {
      throw new Error(`Qdrant error: ${res.status} ${await res.text()}`);
    }

    return {
      ids: request.documents.map((d) => d.id),
      count: request.documents.length,
    };
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    const collection = request.collection || 'default';

    const res = await fetch(`${this.baseUrl}/collections/${collection}/points/search`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        vector: request.queryEmbedding,
        limit: request.topK || 5,
        filter: request.filter,
        with_payload: true,
        score_threshold: request.threshold,
      }),
    });

    if (!res.ok) {
      throw new Error(`Qdrant search error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const results = data.result?.map((r: any, i: number) => ({
      document: {
        id: r.id,
        content: r.payload?.text || '',
        metadata: r.payload || {},
      },
      score: r.score,
      rank: i + 1,
    })) || [];

    return { results };
  }

  async delete(request: DeleteRequest): Promise<void> {
    const collection = request.collection || 'default';

    await fetch(`${this.baseUrl}/collections/${collection}/points/delete?wait=true`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ points: request.ids }),
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/healthz`);
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Weaviate ===

export class WeaviateService extends RAGService {
  readonly name = 'weaviate';

  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl = 'http://localhost:8080', apiKey?: string) {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
    return headers;
  }

  async index(request: IndexRequest): Promise<IndexResponse> {
    const className = request.collection || 'Document';

    // Create schema if not exists
    await fetch(`${this.baseUrl}/v1/schema`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        class: className,
        properties: [
          { name: 'text', dataType: ['text'] },
        ],
        vectorizer: 'none',
      }),
    }).catch(() => {}); // Ignore if already exists

    // Batch insert
    const objects = request.documents.map((doc, i) => ({
      class: className,
      id: doc.id,
      properties: { text: doc.content, ...(doc.metadata || {}) },
      vector: request.embeddings?.[i] || doc.embedding,
    }));

    const res = await fetch(`${this.baseUrl}/v1/batch/objects`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ objects }),
    });

    if (!res.ok) {
      throw new Error(`Weaviate error: ${res.status} ${await res.text()}`);
    }

    return {
      ids: request.documents.map((d) => d.id),
      count: request.documents.length,
    };
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    const className = request.collection || 'Document';

    const res = await fetch(`${this.baseUrl}/v1/graphql`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        query: `{
          Get {
            ${className}(
              nearVector: { vector: [${request.queryEmbedding?.join(',')}] }
              limit: ${request.topK || 5}
            ) {
              text
              _additional { id certainty }
            }
          }
        }`,
      }),
    });

    if (!res.ok) {
      throw new Error(`Weaviate search error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const items = data.data?.Get?.[className] || [];

    const results = items.map((item: any, i: number) => ({
      document: {
        id: item._additional?.id || `weaviate-${i}`,
        content: item.text || '',
        metadata: {},
      },
      score: item._additional?.certainty || 0,
      rank: i + 1,
    }));

    return { results };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/.well-known/live`);
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Service Registry ===

export class RAGServiceRegistry {
  private services: Map<string, RAGService> = new Map();

  register(service: RAGService): void {
    this.services.set(service.name, service);
  }

  get(name: string): RAGService | undefined {
    return this.services.get(name);
  }

  list(): string[] {
    return Array.from(this.services.keys());
  }
}

export const ragServices = new RAGServiceRegistry();
