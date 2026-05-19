/**
 * Orium - Knowledge Base System
 * Simple vector-based knowledge storage with cosine similarity search.
 */

export interface Document {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

export interface SearchResult {
  document: Document;
  score: number;
}

export interface KnowledgeBaseConfig {
  id: string;
  name: string;
  embeddingModel?: string;
  embeddingDimension?: number;
}

export class KnowledgeBase {
  readonly id: string;
  readonly name: string;
  embeddingModel: string;
  embeddingDimension: number;
  private documents: Map<string, Document> = new Map();

  constructor(config: KnowledgeBaseConfig) {
    this.id = config.id;
    this.name = config.name;
    this.embeddingModel = config.embeddingModel || 'default';
    this.embeddingDimension = config.embeddingDimension || 384;
  }

  addDocument(doc: Document): void {
    this.documents.set(doc.id, { ...doc });
  }

  getDocument(id: string): Document | undefined {
    return this.documents.get(id);
  }

  updateDocument(id: string, updates: Partial<Omit<Document, 'id'>>): Document | undefined {
    const existing = this.documents.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.documents.set(id, updated);
    return updated;
  }

  removeDocument(id: string): boolean {
    return this.documents.delete(id);
  }

  listDocuments(): Document[] {
    return Array.from(this.documents.values());
  }

  clear(): void {
    this.documents.clear();
  }

  documentCount(): number {
    return this.documents.size;
  }

  /**
   * Search documents by cosine similarity against a query embedding.
   * Falls back to simple keyword matching if embeddings are not available.
   */
  search(queryEmbedding: number[], topK = 5): SearchResult[] {
    const results: SearchResult[] = [];

    for (const doc of this.documents.values()) {
      if (doc.embedding && doc.embedding.length === queryEmbedding.length) {
        const score = this.cosineSimilarity(queryEmbedding, doc.embedding);
        results.push({ document: doc, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Simple keyword search for documents without embeddings.
   */
  keywordSearch(query: string, topK = 5): SearchResult[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const results: SearchResult[] = [];

    for (const doc of this.documents.values()) {
      const content = doc.content.toLowerCase();
      let matches = 0;
      for (const term of terms) {
        if (content.includes(term)) matches++;
      }
      if (matches > 0) {
        results.push({ document: doc, score: matches / terms.length });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
