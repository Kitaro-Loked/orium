/**
 * Orium - WebSocket Server
 * Real-time chat with streaming support.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { AdapterRegistry, ModelAdapter } from '../adapters/base.js';
import { ChatSession } from '../chat/session.js';
import type { SkillRegistry } from '../skills/base.js';

export interface WSServerOptions {
  port?: number;
  adapterRegistry: AdapterRegistry;
  skillRegistry?: SkillRegistry;
  defaultAdapter?: string;
  apiKey?: string;
}

interface WSClient {
  ws: WebSocket;
  session?: ChatSession;
  adapter?: string;
  model?: string;
}

export class OriumWebSocketServer {
  private port: number;
  private adapterRegistry: AdapterRegistry;
  private skillRegistry?: SkillRegistry;
  private defaultAdapter?: string;
  private apiKey?: string;
  private clients: Map<string, WSClient> = new Map();

  constructor(options: WSServerOptions) {
    this.port = options.port || 3001;
    this.adapterRegistry = options.adapterRegistry;
    this.skillRegistry = options.skillRegistry;
    this.defaultAdapter = options.defaultAdapter;
    this.apiKey = options.apiKey;
  }

  start(): void {
    const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ws-ready', endpoint: `ws://localhost:${this.port}` }));
    });

    const wss = new WebSocketServer({ server: httpServer });

    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const client: WSClient = { ws };
      this.clients.set(clientId, client);

      console.log(`WS client connected: ${clientId}`);

      ws.on('message', async (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          await this.handleMessage(clientId, client, msg);
        } catch (err) {
          this.send(client, { type: 'error', error: String(err) });
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`WS client disconnected: ${clientId}`);
      });

      this.send(client, { type: 'connected', clientId });
    });

    httpServer.listen(this.port, () => {
      console.log(`Orium WebSocket server running on ws://localhost:${this.port}`);
    });
  }

  private async handleMessage(clientId: string, client: WSClient, msg: any): Promise<void> {
    switch (msg.type) {
      case 'init': {
        const adapterName = msg.adapter || this.defaultAdapter;
        const adapter = this.getAdapter(adapterName);

        if (!adapter) {
          this.send(client, { type: 'error', error: `Adapter not found: ${adapterName}` });
          return;
        }

        client.adapter = adapter.name;
        client.model = msg.model;
        client.session = new ChatSession(adapter, {
          model: msg.model,
          systemPrompt: msg.systemPrompt,
          temperature: msg.temperature,
        }, this.skillRegistry);

        this.send(client, {
          type: 'initialized',
          adapter: adapter.name,
          model: msg.model,
          skills: this.skillRegistry?.list().filter((s) => s.active).map((s) => s.name) || [],
        });
        break;
      }

      case 'message': {
        if (!client.session) {
          this.send(client, { type: 'error', error: 'Session not initialized. Send init first.' });
          return;
        }

        const response = await client.session.send(msg.content, msg.imageUrl);

        this.send(client, {
          type: 'response',
          id: response.id,
          content: response.content,
          model: response.model,
          usage: response.usage,
        });

        // Send tool results if any
        if (response.toolCalls && response.toolCalls.length > 0) {
          for (const tc of response.toolCalls) {
            this.send(client, {
              type: 'tool_call',
              tool: tc.name,
              arguments: tc.arguments,
            });
          }

          const toolResults = client.session.getToolResults();
          const newResults = toolResults.slice(-(response.toolCalls.length || 0));
          for (const tr of newResults) {
            this.send(client, {
              type: 'tool_result',
              tool: tr.name,
              result: tr.result,
            });
          }
        }
        break;
      }

      case 'stream': {
        if (!client.session) {
          this.send(client, { type: 'error', error: 'Session not initialized.' });
          return;
        }

        const stream = client.session.stream(msg.content, msg.imageUrl);
        this.send(client, { type: 'stream_start' });

        try {
          while (true) {
            const { done, value } = await stream.next();
            if (done) {
              this.send(client, { type: 'stream_end', content: value.content });
              break;
            }
            this.send(client, { type: 'stream_chunk', chunk: value });
          }
        } catch (err) {
          this.send(client, { type: 'error', error: String(err) });
        }
        break;
      }

      case 'history': {
        if (!client.session) {
          this.send(client, { type: 'error', error: 'Session not initialized.' });
          return;
        }
        this.send(client, {
          type: 'history',
          messages: client.session.getHistory(),
        });
        break;
      }

      case 'clear': {
        if (!client.session) {
          this.send(client, { type: 'error', error: 'Session not initialized.' });
          return;
        }
        client.session.clearHistory();
        this.send(client, { type: 'cleared' });
        break;
      }

      case 'switch_adapter': {
        const adapter = this.getAdapter(msg.adapter);
        if (!adapter) {
          this.send(client, { type: 'error', error: `Adapter not found: ${msg.adapter}` });
          return;
        }
        client.adapter = adapter.name;
        client.model = msg.model;
        if (client.session) {
          client.session.setAdapter(adapter, msg.model);
        }
        this.send(client, { type: 'adapter_switched', adapter: adapter.name, model: msg.model });
        break;
      }

      default:
        this.send(client, { type: 'error', error: `Unknown message type: ${msg.type}` });
    }
  }

  private send(client: WSClient, data: any): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
    }
  }

  private getAdapter(name?: string): ModelAdapter | undefined {
    if (name) return this.adapterRegistry.get(name);
    if (this.defaultAdapter) return this.adapterRegistry.get(this.defaultAdapter);
    const first = this.adapterRegistry.list()[0];
    return first ? this.adapterRegistry.get(first) : undefined;
  }
}
