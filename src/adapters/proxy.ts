/**
 * Orium - Proxy / 代理 / Tunnel Adapter
 * For SOCKS5, HTTP proxy, VPN tunnel, and censorship circumvention.
 */

import { ModelAdapter, CompletionRequest, CompletionResponse } from './base';

export interface ProxyConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  proxyType?: 'http' | 'socks5' | 'socks4';
  proxyHost?: string;
  proxyPort?: number;
  proxyAuth?: { username: string; password: string };
  proxyUrl?: string; // e.g., http://user:pass@host:port
  timeout?: number;
  models?: string[];
  customHeaders?: Record<string, string>;
}

export class ProxyAdapter extends ModelAdapter {
  readonly name: string;
  readonly supportedModels: string[];

  private config: ProxyConfig;

  constructor(config: ProxyConfig) {
    super();
    this.name = config.name;
    this.config = config;
    this.supportedModels = config.models || [];
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private async fetchWithProxy(url: string, options: RequestInit): Promise<Response> {
    // Note: In Node.js environment, you'd use undici/agent or node-fetch with proxy-agent
    // In browser, this relies on system proxy settings
    // This is a simplified implementation - real proxy support needs platform-specific handling

    const timeout = this.config.timeout || 60000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // If proxyUrl is provided, we might need to tunnel through it
      // For now, standard fetch (system proxy will be used in most environments)
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return res;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const res = await this.fetchWithProxy(
      `${this.config.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens,
          tools: request.tools,
          stream: false,
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`${this.name} error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];

    return {
      id: data.id || `${this.name}-${Date.now()}`,
      content: choice?.message?.content || choice?.text || '',
      toolCalls: choice?.message?.tool_calls?.map((tc: any) => ({
        id: tc.id,
        name: tc.function?.name || tc.name,
        arguments: typeof tc.function?.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function?.arguments || tc.arguments || {},
      })),
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  }

  async stream(
    request: CompletionRequest,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResponse> {
    const res = await this.fetchWithProxy(
      `${this.config.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens,
          stream: true,
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`${this.name} error: ${res.status} ${await res.text()}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    let fullContent = '';
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter((l) => l.trim().startsWith('data: '));

      for (const line of lines) {
        const json = line.replace('data: ', '');
        if (json === '[DONE]') continue;
        try {
          const parsed = JSON.parse(json);
          const delta = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || '';
          fullContent += delta;
          onChunk(delta);
        } catch {
          // ignore malformed
        }
      }
    }

    return {
      id: `stream-${Date.now()}`,
      content: fullContent,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.fetchWithProxy(
        `${this.config.baseUrl}/models`,
        { headers: this.getHeaders() }
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Pre-configured proxy factories.
 */
export const proxyFactories = {
  /** Generic proxy adapter */
  create: (config: ProxyConfig) => new ProxyAdapter(config),

  /** HTTP proxy */
  http: (baseUrl: string, apiKey: string, proxyHost: string, proxyPort: number, proxyAuth?: { username: string; password: string }) =>
    new ProxyAdapter({
      name: 'http-proxy',
      baseUrl,
      apiKey,
      proxyType: 'http',
      proxyHost,
      proxyPort,
      proxyAuth,
    }),

  /** SOCKS5 proxy */
  socks5: (baseUrl: string, apiKey: string, proxyHost: string, proxyPort: number, proxyAuth?: { username: string; password: string }) =>
    new ProxyAdapter({
      name: 'socks5-proxy',
      baseUrl,
      apiKey,
      proxyType: 'socks5',
      proxyHost,
      proxyPort,
      proxyAuth,
    }),

  /** Proxy URL (e.g., http://user:pass@host:port) */
  proxyUrl: (baseUrl: string, apiKey: string, proxyUrl: string) =>
    new ProxyAdapter({
      name: 'proxy-url',
      baseUrl,
      apiKey,
      proxyUrl,
    }),

  /** Cloudflare Warp / WARP+ */
  warp: (baseUrl: string, apiKey: string) =>
    new ProxyAdapter({
      name: 'warp',
      baseUrl,
      apiKey,
      customHeaders: {
        'CF-Connecting-IP': '1.1.1.1',
      },
    }),

  /** V2Ray / Xray tunnel */
  v2ray: (baseUrl: string, apiKey: string) =>
    new ProxyAdapter({
      name: 'v2ray',
      baseUrl,
      apiKey,
      timeout: 120000,
    }),

  /** Clash proxy */
  clash: (baseUrl: string, apiKey: string, clashPort = 7890) =>
    new ProxyAdapter({
      name: 'clash',
      baseUrl,
      apiKey,
      proxyType: 'http',
      proxyHost: '127.0.0.1',
      proxyPort: clashPort,
    }),

  /** Shadowsocks local port */
  shadowsocks: (baseUrl: string, apiKey: string, ssPort = 1080) =>
    new ProxyAdapter({
      name: 'shadowsocks',
      baseUrl,
      apiKey,
      proxyType: 'socks5',
      proxyHost: '127.0.0.1',
      proxyPort: ssPort,
    }),

  /** Trojan local port */
  trojan: (baseUrl: string, apiKey: string, trojanPort = 1080) =>
    new ProxyAdapter({
      name: 'trojan',
      baseUrl,
      apiKey,
      proxyType: 'socks5',
      proxyHost: '127.0.0.1',
      proxyPort: trojanPort,
    }),
};
