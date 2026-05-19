/**
 * Orium - Chat History Storage
 * Persistent storage for conversation history.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import type { ChatMessage } from './session';

export interface HistoryEntry {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  model?: string;
}

export class ChatHistory {
  private storagePath: string;
  private sessions: Map<string, HistoryEntry> = new Map();

  constructor(storagePath?: string) {
    this.storagePath = storagePath || resolve(process.cwd(), '.orium', 'history.json');
    this.load();
  }

  private load(): void {
    if (!existsSync(this.storagePath)) {
      return;
    }

    try {
      const data = JSON.parse(readFileSync(this.storagePath, 'utf-8'));
      for (const entry of data.sessions || []) {
        this.sessions.set(entry.id, entry);
      }
    } catch {
      // Ignore corrupted history
    }
  }

  private save(): void {
    const dir = dirname(this.storagePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const data = {
      version: '0.1.0',
      sessions: Array.from(this.sessions.values()),
    };

    writeFileSync(this.storagePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  create(title?: string): string {
    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry: HistoryEntry = {
      id,
      title: title || `Chat ${this.sessions.size + 1}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };

    this.sessions.set(id, entry);
    this.save();
    return id;
  }

  get(id: string): HistoryEntry | undefined {
    return this.sessions.get(id);
  }

  update(id: string, messages: ChatMessage[], model?: string): void {
    const entry = this.sessions.get(id);
    if (!entry) return;

    entry.messages = messages;
    entry.updatedAt = new Date().toISOString();
    if (model) entry.model = model;

    this.sessions.set(id, entry);
    this.save();
  }

  delete(id: string): boolean {
    const result = this.sessions.delete(id);
    if (result) this.save();
    return result;
  }

  list(): HistoryEntry[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  search(query: string): HistoryEntry[] {
    const lower = query.toLowerCase();
    return this.list().filter((entry) => {
      if (entry.title.toLowerCase().includes(lower)) return true;
      return entry.messages.some((m) => m.content.toLowerCase().includes(lower));
    });
  }

  rename(id: string, title: string): void {
    const entry = this.sessions.get(id);
    if (entry) {
      entry.title = title;
      this.save();
    }
  }

  clear(): void {
    this.sessions.clear();
    this.save();
  }
}
