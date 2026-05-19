import { describe, it, expect, vi } from 'vitest';
import { ChatSession } from '../src/chat/session';
import { ChatHistory } from '../src/chat/history';
import { parseCommand, findCommand } from '../src/chat/commands';
import type { ModelAdapter, CompletionRequest, CompletionResponse } from '../src/adapters/base';

// Mock adapter
const mockAdapter: ModelAdapter = {
  name: 'mock',
  supportedModels: ['mock-model'],
  complete: vi.fn(async (req: CompletionRequest): Promise<CompletionResponse> => ({
    id: 'test-1',
    content: 'Hello! This is a test response.',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  })),
  stream: vi.fn(async (req: CompletionRequest, onChunk: (chunk: string) => void) => {
    onChunk('Hello! ');
    onChunk('This is a test response.');
    return {
      id: 'test-1',
      content: 'Hello! This is a test response.',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
  }),
  healthCheck: vi.fn(async () => true),
};

describe('Chat Interface', () => {
  describe('ChatSession', () => {
    it('creates session with system prompt', () => {
      const session = new ChatSession(mockAdapter, {
        systemPrompt: 'You are a coding assistant.',
      });

      const history = session.getHistory();
      expect(history[0].role).toBe('system');
      expect(history[0].content).toBe('You are a coding assistant.');
    });

    it('sends message and receives response', async () => {
      const session = new ChatSession(mockAdapter);
      const response = await session.send('Hello');

      expect(response.role).toBe('assistant');
      expect(response.content).toBe('Hello! This is a test response.');
      expect(mockAdapter.complete).toHaveBeenCalled();

      const history = session.getHistory();
      expect(history.length).toBe(3); // system + user + assistant
      expect(history[0].role).toBe('system');
      expect(history[1].role).toBe('user');
      expect(history[2].role).toBe('assistant');
    });

    it('tracks token usage', async () => {
      const session = new ChatSession(mockAdapter);
      await session.send('Hello');

      const usage = session.getTokenUsage();
      expect(usage.prompt).toBe(10);
      expect(usage.completion).toBe(5);
      expect(usage.total).toBe(15);
    });

    it('clears history while keeping system prompt', () => {
      const session = new ChatSession(mockAdapter, {
        systemPrompt: 'You are helpful.',
      });
      session.clearHistory(true);

      const history = session.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].role).toBe('system');
    });

    it('updates system prompt', () => {
      const session = new ChatSession(mockAdapter, {
        systemPrompt: 'Old prompt.',
      });
      session.setSystemPrompt('New prompt.');

      const history = session.getHistory();
      expect(history[0].content).toBe('New prompt.');
    });

    it('exports and imports session', async () => {
      const session = new ChatSession(mockAdapter);
      await session.send('Hello');

      const exported = session.export();
      expect(exported.messages.length).toBe(3);

      const newSession = new ChatSession(mockAdapter);
      newSession.import(exported);
      expect(newSession.getHistory().length).toBe(3);
    });
  });

  describe('ChatHistory', () => {
    it('creates and retrieves sessions', () => {
      const history = new ChatHistory();
      const id = history.create('Test Chat');

      const entry = history.get(id);
      expect(entry).toBeDefined();
      expect(entry?.title).toBe('Test Chat');
    });

    it('lists sessions in order', () => {
      const history = new ChatHistory();
      // Get initial count to account for persisted sessions from other tests
      const initialList = history.list().filter((s) => s.title.startsWith('ListTest-'));
      const initialCount = initialList.length;

      history.create('ListTest-A');
      history.create('ListTest-B');

      const newList = history.list().filter((s) => s.title.startsWith('ListTest-'));
      expect(newList.length).toBe(initialCount + 2);
    });

    it('updates session messages', () => {
      const history = new ChatHistory();
      const id = history.create('Test');

      history.update(id, [
        { id: '1', role: 'user', content: 'Hello', timestamp: new Date() },
        { id: '2', role: 'assistant', content: 'Hi', timestamp: new Date() },
      ]);

      const entry = history.get(id);
      expect(entry?.messages.length).toBe(2);
    });

    it('searches sessions', () => {
      const history = new ChatHistory();
      const id = history.create('SearchTest');
      history.update(id, [
        { id: '1', role: 'user', content: 'Hello world xyz789', timestamp: new Date() },
      ]);

      const results = history.search('xyz789');
      expect(results.length).toBeGreaterThanOrEqual(1);
      const found = results.find((r) => r.title === 'SearchTest');
      expect(found).toBeDefined();
    });
  });

  describe('Commands', () => {
    it('parses command input', () => {
      const cmd = parseCommand('/model gpt-4o');
      expect(cmd).toEqual({ command: 'model', args: ['gpt-4o'] });
    });

    it('returns null for non-command input', () => {
      const cmd = parseCommand('Hello world');
      expect(cmd).toBeNull();
    });

    it('finds command by name', () => {
      const cmd = findCommand('help');
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe('help');
    });

    it('returns undefined for unknown command', () => {
      expect(findCommand('unknown')).toBeUndefined();
    });

    it('executes help command', async () => {
      const cmd = findCommand('help');
      const result = await cmd!.execute([], {} as any);
      expect(result).toContain('Available commands');
    });

    it('executes clear command', async () => {
      const cmd = findCommand('clear');
      const mockSession = { clearHistory: () => {} } as any;
      const result = await cmd!.execute([], { session: mockSession } as any);
      expect(result).toBe('Conversation history cleared.');
    });
  });
});
