/**
 * Orium - Memory Store
 * Hierarchical memory: working → short-term → long-term
 */

export interface MemoryEntry {
  id: string;
  content: string;
  type: 'fact' | 'conversation' | 'preference' | 'task';
  importance: number; // 0-1
  timestamp: number;
  embeddings?: number[];
  metadata?: Record<string, unknown>;
}

export class MemoryStore {
  private working: Map<string, MemoryEntry> = new Map(); // ~7 items
  private shortTerm: Map<string, MemoryEntry> = new Map(); // ~100 items
  private longTerm: MemoryEntry[] = []; // unlimited, with retrieval

  // Working memory: immediate context
  setWorking(entry: MemoryEntry): void {
    if (this.working.size >= 7) {
      const oldest = Array.from(this.working.values()).sort(
        (a, b) => a.timestamp - b.timestamp
      )[0];
      this.promoteToShortTerm(oldest);
      this.working.delete(oldest.id);
    }
    this.working.set(entry.id, entry);
  }

  // Short-term memory: recent context
  setShortTerm(entry: MemoryEntry): void {
    if (this.shortTerm.size >= 100) {
      const oldest = Array.from(this.shortTerm.values()).sort(
        (a, b) => a.timestamp - b.timestamp
      )[0];
      this.promoteToLongTerm(oldest);
      this.shortTerm.delete(oldest.id);
    }
    this.shortTerm.set(entry.id, entry);
  }

  // Long-term memory: persistent storage
  setLongTerm(entry: MemoryEntry): void {
    this.longTerm.push(entry);
  }

  private promoteToShortTerm(entry: MemoryEntry): void {
    this.setShortTerm({ ...entry, timestamp: Date.now() });
  }

  private promoteToLongTerm(entry: MemoryEntry): void {
    this.setLongTerm({ ...entry, timestamp: Date.now() });
  }

  // Retrieve relevant memories by simple keyword match (replace with vector search)
  retrieve(query: string, limit = 10): MemoryEntry[] {
    const all = [
      ...this.working.values(),
      ...this.shortTerm.values(),
      ...this.longTerm,
    ];
    const lower = query.toLowerCase();
    return all
      .filter((e) => e.content.toLowerCase().includes(lower))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }

  getWorking(): MemoryEntry[] {
    return Array.from(this.working.values());
  }

  getShortTerm(): MemoryEntry[] {
    return Array.from(this.shortTerm.values());
  }

  getLongTerm(): MemoryEntry[] {
    return this.longTerm;
  }

  clear(): void {
    this.working.clear();
    this.shortTerm.clear();
    this.longTerm = [];
  }
}

export const memory = new MemoryStore();
