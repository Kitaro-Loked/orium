/**
 * Orium - IBM Watsonx Adapter
 */

import { ModelAdapter, CompletionRequest, CompletionResponse } from './base';

export class WatsonxAdapter extends ModelAdapter {
  readonly name = 'watsonx';
  readonly supportedModels = [
    'ibm/granite-13b-chat-v2',
    'ibm/granite-20b-multilingual',
    'meta-llama/llama-3-1-70b-instruct',
    'meta-llama/llama-3-1-8b-instruct',
    'mistralai/mixtral-8x7b-instruct-v01',
  ];

  private apiKey: string;
  private projectId: string;
  private baseUrl = 'https://us-south.ml.cloud.ibm.com';

  constructor(apiKey: string, projectId: string, baseUrl?: string) {
    super();
    this.apiKey = apiKey;
    this.projectId = projectId;
    if (baseUrl) this.baseUrl = baseUrl;
  }

  private async getToken(): Promise<string> {
    const res = await fetch('https://iam.cloud.ibm.com/identity/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${this.apiKey}`,
    });
    const data = await res.json();
    return data.access_token;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const token = await this.getToken();
    const model = request.model || 'ibm/granite-13b-chat-v2';

    const res = await fetch(
      `${this.baseUrl}/ml/v1/text/generation?version=2023-05-29`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: model,
          project_id: this.projectId,
          input: request.messages.map((m) => m.content).join('\n\n'),
          parameters: {
            temperature: request.temperature ?? 0.7,
            max_new_tokens: request.maxTokens || 1024,
          },
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Watsonx error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const result = data.results?.[0];

    return {
      id: `watsonx-${Date.now()}`,
      content: result?.generated_text || '',
      usage: {
        promptTokens: result?.input_token_count || 0,
        completionTokens: result?.generated_token_count || 0,
        totalTokens:
          (result?.input_token_count || 0) +
          (result?.generated_token_count || 0),
      },
    };
  }

  async stream(
    request: CompletionRequest,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResponse> {
    const response = await this.complete(request);
    onChunk(response.content as string);
    return response;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const token = await this.getToken();
      const res = await fetch(`${this.baseUrl}/ml/v1/foundation_models?version=2023-05-29`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
