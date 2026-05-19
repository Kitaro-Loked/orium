/**
 * Orium - Multimodal Service (Vision, Audio Understanding)
 * Unified interface for multimodal AI APIs.
 */

export interface VisionRequest {
  image: string | Buffer; // URL, base64, or buffer
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  detail?: 'low' | 'high' | 'auto';
}

export interface VisionResponse {
  id: string;
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AudioUnderstandingRequest {
  audio: string | Buffer; // URL or buffer
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AudioUnderstandingResponse {
  id: string;
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface VideoUnderstandingRequest {
  video: string | Buffer; // URL or buffer
  prompt: string;
  model?: string;
  maxTokens?: number;
  frames?: number; // extract N frames for analysis
}

export interface VideoUnderstandingResponse {
  id: string;
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export abstract class MultimodalService {
  abstract readonly name: string;
  abstract readonly supportedModels: string[];

  abstract vision(request: VisionRequest): Promise<VisionResponse>;
  abstract healthCheck(): Promise<boolean>;

  audio?(request: AudioUnderstandingRequest): Promise<AudioUnderstandingResponse> {
    throw new Error('Audio understanding not supported by this service');
  }

  video?(request: VideoUnderstandingRequest): Promise<VideoUnderstandingResponse> {
    throw new Error('Video understanding not supported by this service');
  }
}

// === OpenAI GPT-4o Vision ===

export class OpenAIVisionService extends MultimodalService {
  readonly name = 'openai-vision';
  readonly supportedModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];

  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async vision(request: VisionRequest): Promise<VisionResponse> {
    const imageUrl = typeof request.image === 'string'
      ? request.image
      : `data:image/jpeg;base64,${Buffer.from(request.image as any).toString('base64')}`;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: request.prompt },
              {
                type: 'image_url',
                image_url: { url: imageUrl, detail: request.detail || 'auto' },
              },
            ],
          },
        ],
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature ?? 0.7,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI vision error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const choice = data.choices[0];

    return {
      id: data.id,
      content: choice.message.content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  }

  async audio(request: AudioUnderstandingRequest): Promise<AudioUnderstandingResponse> {
    const audioUrl = typeof request.audio === 'string'
      ? request.audio
      : `data:audio/wav;base64,${Buffer.from(request.audio as any).toString('base64')}`;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'gpt-4o-audio-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: request.prompt },
              { type: 'input_audio', input_audio: { data: audioUrl.split(',')[1], format: 'wav' } },
            ],
          },
        ],
        max_tokens: request.maxTokens || 4096,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI audio error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: data.id,
      content: data.choices[0]?.message?.content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Google Gemini Vision ===

export class GeminiVisionService extends MultimodalService {
  readonly name = 'gemini-vision';
  readonly supportedModels = ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'];

  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async vision(request: VisionRequest): Promise<VisionResponse> {
    const model = request.model || 'gemini-1.5-pro';

    const imageData = typeof request.image === 'string'
      ? { uri: request.image }
      : { bytes: Buffer.from(request.image as any).toString('base64') };

    const res = await fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: request.prompt },
                { inline_data: { mime_type: 'image/jpeg', data: imageData.bytes || imageData.uri } },
              ],
            },
          ],
          generationConfig: {
            temperature: request.temperature ?? 0.7,
            maxOutputTokens: request.maxTokens || 4096,
          },
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Gemini vision error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      id: `gemini-vision-${Date.now()}`,
      content: text,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
      },
    };
  }

  async video(request: VideoUnderstandingRequest): Promise<VideoUnderstandingResponse> {
    const model = request.model || 'gemini-1.5-pro';

    const videoData = typeof request.video === 'string'
      ? { uri: request.video }
      : { bytes: Buffer.from(request.video as any).toString('base64') };

    const res = await fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: request.prompt },
                { inline_data: { mime_type: 'video/mp4', data: videoData.bytes || videoData.uri } },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: request.maxTokens || 4096,
          },
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Gemini video error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: `gemini-video-${Date.now()}`,
      content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models?key=${this.apiKey}&pageSize=1`);
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Anthropic Claude Vision ===

export class ClaudeVisionService extends MultimodalService {
  readonly name = 'claude-vision';
  readonly supportedModels = ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229'];

  private apiKey: string;
  private baseUrl = 'https://api.anthropic.com/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async vision(request: VisionRequest): Promise<VisionResponse> {
    const imageData = typeof request.image === 'string'
      ? { type: 'image', source: { type: 'url', url: request.image } }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: Buffer.from(request.image as any).toString('base64'),
          },
        };

    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'claude-3-5-sonnet-20241022',
        max_tokens: request.maxTokens || 4096,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: request.prompt },
              imageData as any,
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`Claude vision error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const content = data.content || [];
    const text = content.find((c: any) => c.type === 'text')?.text || '';

    return {
      id: data.id,
      content: text,
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Qwen Vision (通义千问) ===

export class QwenVisionService extends MultimodalService {
  readonly name = 'qwen-vision';
  readonly supportedModels = ['qwen-vl-max', 'qwen-vl-plus', 'qwen2-vl-72b-instruct'];

  private apiKey: string;
  private baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async vision(request: VisionRequest): Promise<VisionResponse> {
    const imageUrl = typeof request.image === 'string'
      ? request.image
      : `data:image/jpeg;base64,${Buffer.from(request.image as any).toString('base64')}`;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'qwen-vl-max',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: request.prompt },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature ?? 0.7,
      }),
    });

    if (!res.ok) {
      throw new Error(`Qwen vision error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: data.id,
      content: data.choices?.[0]?.message?.content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  }

  async video(request: VideoUnderstandingRequest): Promise<VideoUnderstandingResponse> {
    const videoUrl = typeof request.video === 'string'
      ? request.video
      : `data:video/mp4;base64,${Buffer.from(request.video as any).toString('base64')}`;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'qwen-vl-max',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: request.prompt },
              { type: 'video', video: videoUrl },
            ],
          },
        ],
        max_tokens: request.maxTokens || 4096,
      }),
    });

    if (!res.ok) {
      throw new Error(`Qwen video error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: data.id,
      content: data.choices?.[0]?.message?.content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Service Registry ===

export class MultimodalServiceRegistry {
  private services: Map<string, MultimodalService> = new Map();

  register(service: MultimodalService): void {
    this.services.set(service.name, service);
  }

  get(name: string): MultimodalService | undefined {
    return this.services.get(name);
  }

  list(): string[] {
    return Array.from(this.services.keys());
  }
}

export const multimodalServices = new MultimodalServiceRegistry();
