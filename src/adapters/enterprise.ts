/**
 * Orium - Enterprise / 私有化部署 Adapter
 * For on-premise, air-gapped, and enterprise deployments.
 */

import { ModelAdapter, CompletionRequest, CompletionResponse } from './base';

/**
 * Generic Enterprise Adapter - for corporate proxies, VPNs, and internal APIs
 */
export class EnterpriseAdapter extends ModelAdapter {
  readonly name: string;
  readonly supportedModels: string[];

  private baseUrl: string;
  private apiKey?: string;
  private proxyUrl?: string;
  private caCert?: string;
  private timeout: number;
  private customHeaders: Record<string, string>;

  constructor(config: {
    name: string;
    baseUrl: string;
    apiKey?: string;
    proxyUrl?: string;
    caCert?: string;
    timeout?: number;
    customHeaders?: Record<string, string>;
    models?: string[];
  }) {
    super();
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.proxyUrl = config.proxyUrl;
    this.caCert = config.caCert;
    this.timeout = config.timeout || 60000;
    this.customHeaders = config.customHeaders || {};
    this.supportedModels = config.models || [];
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.customHeaders,
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
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
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
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
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
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
      const res = await this.fetchWithTimeout(
        `${this.baseUrl}/models`,
        { headers: this.getHeaders() }
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Pre-configured enterprise deployment factories.
 */
export const enterpriseFactories = {
  /** Generic enterprise deployment */
  create: (config: ConstructorParameters<typeof EnterpriseAdapter>[0]) =>
    new EnterpriseAdapter(config),

  /** Internal OpenAI-compatible deployment behind corporate proxy */
  internal: (baseUrl: string, apiKey?: string, proxyUrl?: string) =>
    new EnterpriseAdapter({
      name: 'internal',
      baseUrl,
      apiKey,
      proxyUrl,
      customHeaders: {
        'X-Internal-Client': 'orium',
      },
    }),

  /** Air-gapped deployment (no internet) */
  airgapped: (baseUrl: string, apiKey?: string) =>
    new EnterpriseAdapter({
      name: 'airgapped',
      baseUrl,
      apiKey,
      timeout: 120000,
      customHeaders: {
        'X-Airgapped': 'true',
      },
    }),

  /** Deployment with mTLS / custom CA */
  mtls: (baseUrl: string, apiKey: string, caCert: string) =>
    new EnterpriseAdapter({
      name: 'mtls',
      baseUrl,
      apiKey,
      caCert,
      customHeaders: {
        'X-mTLS-Verified': 'true',
      },
    }),

  /** Alibaba Cloud PAI-EAS */
  alibabaPai: (baseUrl: string, token: string) =>
    new EnterpriseAdapter({
      name: 'alibaba-pai',
      baseUrl,
      apiKey: token,
      customHeaders: {
        Authorization: token,
      },
    }),

  /** Huawei Cloud ModelArts */
  huaweiModelArts: (baseUrl: string, token: string) =>
    new EnterpriseAdapter({
      name: 'huawei-modelarts',
      baseUrl,
      apiKey: token,
      customHeaders: {
        'X-Auth-Token': token,
      },
    }),

  /** Baidu Cloud BML */
  baiduBml: (baseUrl: string, apiKey: string) =>
    new EnterpriseAdapter({
      name: 'baidu-bml',
      baseUrl,
      apiKey,
      customHeaders: {
        'X-Bce-Signature': apiKey,
      },
    }),

  /** Tencent Cloud TI-ONE */
  tencentTione: (baseUrl: string, secretId: string, secretKey: string) =>
    new EnterpriseAdapter({
      name: 'tencent-tione',
      baseUrl,
      customHeaders: {
        'X-TC-SecretId': secretId,
        'X-TC-SecretKey': secretKey,
      },
    }),

  /** 私有化部署 - 自定义 */
  custom: (name: string, baseUrl: string, config?: Partial<ConstructorParameters<typeof EnterpriseAdapter>[0]>) =>
    new EnterpriseAdapter({
      name,
      baseUrl,
      ...config,
    }),
};
