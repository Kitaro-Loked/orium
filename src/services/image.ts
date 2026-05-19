/**
 * Orium - Image Generation Service
 * Unified interface for all image generation APIs.
 */

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  size?: string; // e.g., "1024x1024", "1024x1792"
  quality?: 'standard' | 'hd' | 'high' | 'medium' | 'low';
  style?: string; // e.g., "vivid", "natural", "anime", "photorealistic"
  n?: number; // number of images
  seed?: number;
  steps?: number;
  cfgScale?: number;
  aspectRatio?: string; // e.g., "16:9", "1:1", "9:16"
}

export interface ImageGenerationResponse {
  id: string;
  images: Array<{
    url?: string;
    base64?: string;
    revisedPrompt?: string;
    seed?: number;
  }>;
  usage?: {
    promptTokens?: number;
    totalTokens?: number;
  };
}

export interface ImageEditRequest {
  image: string | Buffer; // URL, base64, or buffer
  mask?: string | Buffer;
  prompt: string;
  model?: string;
  size?: string;
  n?: number;
}

export interface ImageVariationRequest {
  image: string | Buffer;
  model?: string;
  size?: string;
  n?: number;
}

export abstract class ImageService {
  abstract readonly name: string;
  abstract readonly supportedModels: string[];

  abstract generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse>;
  abstract healthCheck(): Promise<boolean>;

  edit?(request: ImageEditRequest): Promise<ImageGenerationResponse> {
    throw new Error('Image editing not supported by this service');
  }

  vary?(request: ImageVariationRequest): Promise<ImageGenerationResponse> {
    throw new Error('Image variation not supported by this service');
  }
}

// === OpenAI DALL-E ===

export class DalleService extends ImageService {
  readonly name = 'dalle';
  readonly supportedModels = ['dall-e-3', 'dall-e-2'];

  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const res = await fetch(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'dall-e-3',
        prompt: request.prompt,
        size: request.size || '1024x1024',
        quality: request.quality || 'standard',
        style: request.style || 'vivid',
        n: request.n || 1,
        response_format: 'url',
      }),
    });

    if (!res.ok) {
      throw new Error(`DALL-E error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: `dalle-${Date.now()}`,
      images: data.data.map((img: any) => ({
        url: img.url,
        revisedPrompt: img.revised_prompt,
      })),
      usage: data.usage,
    };
  }

  async edit(request: ImageEditRequest): Promise<ImageGenerationResponse> {
    const formData = new FormData();
    formData.append('image', new Blob([request.image as BlobPart]));
    if (request.mask) formData.append('mask', new Blob([request.mask as BlobPart]));
    formData.append('prompt', request.prompt);
    formData.append('size', request.size || '1024x1024');
    formData.append('n', String(request.n || 1));

    const res = await fetch(`${this.baseUrl}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`DALL-E edit error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: `dalle-edit-${Date.now()}`,
      images: data.data.map((img: any) => ({ url: img.url })),
    };
  }

  async vary(request: ImageVariationRequest): Promise<ImageGenerationResponse> {
    const formData = new FormData();
    formData.append('image', new Blob([request.image as BlobPart]));
    formData.append('size', request.size || '1024x1024');
    formData.append('n', String(request.n || 1));

    const res = await fetch(`${this.baseUrl}/images/variations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    const data = await res.json();
    return {
      id: `dalle-var-${Date.now()}`,
      images: data.data.map((img: any) => ({ url: img.url })),
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

// === Midjourney (via API proxy) ===

export class MidjourneyService extends ImageService {
  readonly name = 'midjourney';
  readonly supportedModels = ['midjourney-v6', 'midjourney-v5.2', 'midjourney-niji'];

  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://api.midjourneyapi.xyz') {
    super();
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const res = await fetch(`${this.baseUrl}/v2/imagine`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: request.prompt,
        model: request.model || 'midjourney-v6',
        aspect_ratio: request.aspectRatio || '1:1',
        quality: request.quality,
        seed: request.seed,
      }),
    });

    if (!res.ok) {
      throw new Error(`Midjourney error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: data.task_id || `mj-${Date.now()}`,
      images: data.image_urls?.map((url: string) => ({ url })) || [],
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Stable Diffusion (Stability AI) ===

export class StabilityService extends ImageService {
  readonly name = 'stability';
  readonly supportedModels = [
    'stable-diffusion-xl-1024-v1-0',
    'stable-diffusion-v1-6',
    'stable-image-ultra',
    'stable-image-core',
  ];

  private apiKey: string;
  private baseUrl = 'https://api.stability.ai';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const engine = request.model || 'stable-diffusion-xl-1024-v1-0';
    const res = await fetch(`${this.baseUrl}/v1/generation/${engine}/text-to-image`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text_prompts: [
          { text: request.prompt, weight: 1 },
          ...(request.negativePrompt ? [{ text: request.negativePrompt, weight: -1 }] : []),
        ],
        cfg_scale: request.cfgScale || 7,
        steps: request.steps || 30,
        seed: request.seed || 0,
        samples: request.n || 1,
      }),
    });

    if (!res.ok) {
      throw new Error(`Stability error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: data.id || `stability-${Date.now()}`,
      images: data.artifacts?.map((a: any) => ({
        base64: a.base64,
        seed: a.seed,
      })) || [],
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/user/account`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Leonardo AI ===

export class LeonardoService extends ImageService {
  readonly name = 'leonardo';
  readonly supportedModels = [
    'leonardo-diffusion-xl',
    'leonardo-kino-xl',
    'leonardo-vision-xl',
    'sdxl',
  ];

  private apiKey: string;
  private baseUrl = 'https://cloud.leonardo.ai/api/rest/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const res = await fetch(`${this.baseUrl}/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: request.prompt,
        negative_prompt: request.negativePrompt,
        modelId: request.model || 'leonardo-diffusion-xl',
        width: request.size ? parseInt(request.size.split('x')[0]) : 1024,
        height: request.size ? parseInt(request.size.split('x')[1]) : 1024,
        num_images: request.n || 1,
        seed: request.seed,
      }),
    });

    if (!res.ok) {
      throw new Error(`Leonardo error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: data.sdGenerationJob?.generationId || `leonardo-${Date.now()}`,
      images: data.sdGenerationJob?.imageUrls?.map((url: string) => ({ url })) || [],
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/me`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Ideogram ===

export class IdeogramService extends ImageService {
  readonly name = 'ideogram';
  readonly supportedModels = ['V_2', 'V_1', 'V_1_TURBO'];

  private apiKey: string;
  private baseUrl = 'https://api.ideogram.ai';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const res = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_request: {
          prompt: request.prompt,
          model: request.model || 'V_2',
          aspect_ratio: request.aspectRatio || 'ASPECT_1_1',
          magic_prompt_option: 'AUTO',
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ideogram error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: data.created || `ideogram-${Date.now()}`,
      images: data.data?.map((img: any) => ({ url: img.url })) || [],
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

// === Recraft ===

export class RecraftService extends ImageService {
  readonly name = 'recraft';
  readonly supportedModels = ['recraftv3', 'recraftv2'];

  private apiKey: string;
  private baseUrl = 'https://external.api.recraft.ai/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const res = await fetch(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: request.prompt,
        style: request.style || 'digital_illustration',
        size: request.size || '1024x1024',
      }),
    });

    if (!res.ok) {
      throw new Error(`Recraft error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: `recraft-${Date.now()}`,
      images: data.data?.map((img: any) => ({ url: img.url })) || [],
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/user`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Pollinations Image ===

export class PollinationsImageService extends ImageService {
  readonly name = 'pollinations-image';
  readonly supportedModels = ['flux', 'flux-realism', 'flux-anime', 'flux-3d', 'turbo'];

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const model = request.model || 'flux';
    const width = request.size ? parseInt(request.size.split('x')[0]) : 1024;
    const height = request.size ? parseInt(request.size.split('x')[1]) : 1024;
    const seed = request.seed || Math.floor(Math.random() * 1000000);

    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(request.prompt)}?` +
      `model=${model}&width=${width}&height=${height}&seed=${seed}&nologo=true`;

    return {
      id: `pollinations-${Date.now()}`,
      images: [{ url, seed }],
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch('https://image.pollinations.ai/health');
      return res.ok;
    } catch {
      return true; // Free service, assume available
    }
  }
}

// === Service Registry ===

export class ImageServiceRegistry {
  private services: Map<string, ImageService> = new Map();

  register(service: ImageService): void {
    this.services.set(service.name, service);
  }

  get(name: string): ImageService | undefined {
    return this.services.get(name);
  }

  list(): string[] {
    return Array.from(this.services.keys());
  }

  async generateAny(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    for (const [name, service] of this.services) {
      try {
        const healthy = await service.healthCheck();
        if (healthy) {
          return await service.generate(request);
        }
      } catch {
        continue;
      }
    }
    throw new Error('No image service available');
  }
}

export const imageServices = new ImageServiceRegistry();
