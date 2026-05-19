/**
 * Orium - Video Generation Service
 * Unified interface for video generation APIs.
 */

export interface VideoGenerationRequest {
  prompt: string;
  model?: string;
  duration?: number; // seconds
  resolution?: string; // e.g., "1080p", "720p", "480p"
  aspectRatio?: string; // e.g., "16:9", "9:16", "1:1"
  fps?: number;
  style?: string;
  negativePrompt?: string;
  seed?: number;
  image?: string | Buffer; // image-to-video
}

export interface VideoGenerationResponse {
  id: string;
  url?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  frames?: number;
  duration?: number;
}

export interface VideoEditRequest {
  video: string | Buffer;
  prompt: string;
  model?: string;
}

export abstract class VideoService {
  abstract readonly name: string;
  abstract readonly supportedModels: string[];

  abstract generate(request: VideoGenerationRequest): Promise<VideoGenerationResponse>;
  abstract getStatus?(id: string): Promise<VideoGenerationResponse>;
  abstract healthCheck(): Promise<boolean>;
}

// === Runway ML ===

export class RunwayService extends VideoService {
  readonly name = 'runway';
  readonly supportedModels = ['gen3', 'gen2', 'gen1'];

  private apiKey: string;
  private baseUrl = 'https://api.runwayml.com/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async generate(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    const res = await fetch(`${this.baseUrl}/text-to-video`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: request.prompt,
        model: request.model || 'gen3',
        duration: request.duration || 4,
        ratio: request.aspectRatio || '16:9',
        seed: request.seed,
      }),
    });

    if (!res.ok) {
      throw new Error(`Runway error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: data.id,
      status: 'pending',
    };
  }

  async getStatus(id: string): Promise<VideoGenerationResponse> {
    const res = await fetch(`${this.baseUrl}/tasks/${id}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const data = await res.json();
    return {
      id,
      status: data.status,
      url: data.output?.[0],
      progress: data.progress,
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

// === Pika Labs ===

export class PikaService extends VideoService {
  readonly name = 'pika';
  readonly supportedModels = ['pika-2.0', 'pika-1.5', 'pika-1.0'];

  private apiKey: string;
  private baseUrl = 'https://api.pika.art/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async generate(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    const res = await fetch(`${this.baseUrl}/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: request.prompt,
        model: request.model || 'pika-2.0',
        duration: request.duration || 3,
        aspect_ratio: request.aspectRatio || '16:9',
        seed: request.seed,
        ...(request.image ? { image: request.image } : {}),
      }),
    });

    if (!res.ok) {
      throw new Error(`Pika error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: data.id,
      status: 'pending',
    };
  }

  async getStatus(id: string): Promise<VideoGenerationResponse> {
    const res = await fetch(`${this.baseUrl}/generations/${id}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const data = await res.json();
    return {
      id,
      status: data.status,
      url: data.video?.url,
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

// === Kling AI (快手) ===

export class KlingService extends VideoService {
  readonly name = 'kling';
  readonly supportedModels = ['kling-v1.6', 'kling-v1.5', 'kling-v1'];

  private apiKey: string;
  private baseUrl = 'https://api.klingai.com/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async generate(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    const res = await fetch(`${this.baseUrl}/videos/text2video`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: request.prompt,
        negative_prompt: request.negativePrompt,
        model: request.model || 'kling-v1.6',
        duration: request.duration || 5,
        aspect_ratio: request.aspectRatio || '16:9',
      }),
    });

    if (!res.ok) {
      throw new Error(`Kling error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: data.data?.task_id || `kling-${Date.now()}`,
      status: 'pending',
    };
  }

  async getStatus(id: string): Promise<VideoGenerationResponse> {
    const res = await fetch(`${this.baseUrl}/videos/${id}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const data = await res.json();
    return {
      id,
      status: data.data?.status || 'pending',
      url: data.data?.video_url,
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

// === Luma Dream Machine ===

export class LumaService extends VideoService {
  readonly name = 'luma';
  readonly supportedModels = ['dream-machine-v1'];

  private apiKey: string;
  private baseUrl = 'https://api.lumalabs.ai/dream-machine/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async generate(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    const res = await fetch(`${this.baseUrl}/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: request.prompt,
        aspect_ratio: request.aspectRatio || '16:9',
        loop: false,
        ...(request.image ? { keyframe: { type: 'image', url: request.image } } : {}),
      }),
    });

    if (!res.ok) {
      throw new Error(`Luma error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: data.id,
      status: 'pending',
    };
  }

  async getStatus(id: string): Promise<VideoGenerationResponse> {
    const res = await fetch(`${this.baseUrl}/generations/${id}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const data = await res.json();
    return {
      id,
      status: data.state === 'completed' ? 'completed' : 'processing',
      url: data.assets?.video,
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

// === Service Registry ===

export class VideoServiceRegistry {
  private services: Map<string, VideoService> = new Map();

  register(service: VideoService): void {
    this.services.set(service.name, service);
  }

  get(name: string): VideoService | undefined {
    return this.services.get(name);
  }

  list(): string[] {
    return Array.from(this.services.keys());
  }
}

export const videoServices = new VideoServiceRegistry();
