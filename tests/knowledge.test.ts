import { describe, it, expect } from 'vitest';
import { KnowledgeBase, type Document } from '../src/knowledge/base';

describe('KnowledgeBase', () => {
  it('creates a knowledge base with config', () => {
    const kb = new KnowledgeBase({ id: 'kb1', name: 'Test KB' });
    expect(kb.id).toBe('kb1');
    expect(kb.name).toBe('Test KB');
    expect(kb.documentCount()).toBe(0);
  });

  it('adds and retrieves documents', () => {
    const kb = new KnowledgeBase({ id: 'kb1', name: 'Test KB' });
    const doc: Document = { id: 'd1', content: 'Hello world', metadata: { source: 'test' } };

    kb.addDocument(doc);
    expect(kb.documentCount()).toBe(1);

    const retrieved = kb.getDocument('d1');
    expect(retrieved?.content).toBe('Hello world');
    expect(retrieved?.metadata?.source).toBe('test');
  });

  it('updates a document', () => {
    const kb = new KnowledgeBase({ id: 'kb1', name: 'Test KB' });
    kb.addDocument({ id: 'd1', content: 'Original' });

    const updated = kb.updateDocument('d1', { content: 'Updated' });
    expect(updated?.content).toBe('Updated');
    expect(kb.getDocument('d1')?.content).toBe('Updated');
  });

  it('returns undefined when updating non-existent document', () => {
    const kb = new KnowledgeBase({ id: 'kb1', name: 'Test KB' });
    expect(kb.updateDocument('missing', { content: 'X' })).toBeUndefined();
  });

  it('removes a document', () => {
    const kb = new KnowledgeBase({ id: 'kb1', name: 'Test KB' });
    kb.addDocument({ id: 'd1', content: 'Hello' });

    expect(kb.removeDocument('d1')).toBe(true);
    expect(kb.documentCount()).toBe(0);
    expect(kb.removeDocument('d1')).toBe(false);
  });

  it('lists all documents', () => {
    const kb = new KnowledgeBase({ id: 'kb1', name: 'Test KB' });
    kb.addDocument({ id: 'd1', content: 'A' });
    kb.addDocument({ id: 'd2', content: 'B' });

    const docs = kb.listDocuments();
    expect(docs.length).toBe(2);
  });

  it('clears all documents', () => {
    const kb = new KnowledgeBase({ id: 'kb1', name: 'Test KB' });
    kb.addDocument({ id: 'd1', content: 'A' });
    kb.clear();
    expect(kb.documentCount()).toBe(0);
  });

  it('searches by cosine similarity', () => {
    const kb = new KnowledgeBase({ id: 'kb1', name: 'Test KB' });
    kb.addDocument({ id: 'd1', content: 'A', embedding: [1, 0, 0] });
    kb.addDocument({ id: 'd2', content: 'B', embedding: [0, 1, 0] });
    kb.addDocument({ id: 'd3', content: 'C', embedding: [1, 1, 0] });

    const results = kb.search([1, 0, 0], 2);
    expect(results.length).toBe(2);
    expect(results[0].document.id).toBe('d1');
    expect(results[0].score).toBeCloseTo(1, 5);
  });

  it('performs keyword search', () => {
    const kb = new KnowledgeBase({ id: 'kb1', name: 'Test KB' });
    kb.addDocument({ id: 'd1', content: 'The quick brown fox' });
    kb.addDocument({ id: 'd2', content: 'Lazy dog sleeping' });
    kb.addDocument({ id: 'd3', content: 'Quick fox jumps' });

    const results = kb.keywordSearch('quick fox', 2);
    expect(results.length).toBe(2);
    expect(results[0].document.id).toBe('d1');
    expect(results[0].score).toBe(1);
  });

  it('returns empty results for keyword search with no matches', () => {
    const kb = new KnowledgeBase({ id: 'kb1', name: 'Test KB' });
    kb.addDocument({ id: 'd1', content: 'Hello world' });

    const results = kb.keywordSearch('nonexistent term');
    expect(results.length).toBe(0);
  });
});
