/**
 * Orium - Music Generation Service
 * Unified interface for music and audio generation APIs.
 */

export interface MusicGenerationRequest {
  prompt: string;
  model?: string;
  duration?: number; // seconds
  genre?: string; // e.g., "pop", "rock", "classical", "jazz", "electronic"
  mood?: string; // e.g., "happy", "sad", "energetic", "calm"
  tempo?: number; // BPM
  key?: string; // e.g., "C major", "A minor"
  instruments?: string[];
  vocals?: boolean;
  lyrics?: string;
  seed?: number;
}

export interface MusicGenerationResponse {
  id: string;
  url?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  duration?: number;
  format?: string;
}

export interface StemSeparationRequest {
  audio: string | Buffer;
  stems?: ('vocals' | 'drums' | 'bass' | 'guitar' | 'piano' | 'other')[];
}

export interface StemSeparationResponse {
  id: string;
  stems: Record<string, string>; // stem name -> url
}

export abstract class MusicService {
  abstract readonly name: string;
  abstract readonly supportedModels: string[];

  abstract generate(request: MusicGenerationRequest): Promise<MusicGenerationResponse>;
  abstract healthCheck(): Promise<boolean>;

  getStatus?(id: string): Promise<MusicGenerationResponse> {
    throw new Error('Get status not supported by this service');
  }

  separateStems?(request: StemSeparationRequest): Promise<StemSeparationResponse> {
    throw new Error('Stem separation not supported by this service');
  }
}

// === Suno ===

export class SunoService extends MusicService {
  readonly name = 'suno';
  readonly supportedModels = ['suno-v4', 'suno-v3.5', 'suno-v3'];

  private apiKey: string;
  private baseUrl = 'https://api.suno.ai/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async generate(request: MusicGenerationRequest): Promise<MusicGenerationResponse> {
    const res = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: request.prompt,
        model: request.model || 'suno-v4',
        duration: request.duration || 30,
        genre: request.genre,
        mood: request.mood,
        tempo: request.tempo,
        key: request.key,
        instruments: request.instruments,
        make_instrumental: !request.vocals,
        lyrics: request.lyrics,
        seed: request.seed,
      }),
    });

    if (!res.ok) {
      throw new Error(`Suno error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: data.id,
      status: 'pending',
    };
  }

  async getStatus(id: string): Promise<MusicGenerationResponse> {
    const res = await fetch(`${this.baseUrl}/generate/${id}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const data = await res.json();
    return {
      id,
      status: data.status,
      url: data.audio_url,
      duration: data.duration,
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

// === Udio ===

export class UdioService extends MusicService {
  readonly name = 'udio';
  readonly supportedModels = ['udio-v1.5', 'udio-v1'];

  private apiKey: string;
  private baseUrl = 'https://api.udio.com/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async generate(request: MusicGenerationRequest): Promise<MusicGenerationResponse> {
    const res = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: request.prompt,
        model: request.model || 'udio-v1.5',
        duration: request.duration || 30,
        seed: request.seed,
      }),
    });

    if (!res.ok) {
      throw new Error(`Udio error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: data.id,
      status: 'pending',
    };
  }

  async getStatus(id: string): Promise<MusicGenerationResponse> {
    const res = await fetch(`${this.baseUrl}/generate/${id}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const data = await res.json();
    return {
      id,
      status: data.status,
      url: data.audio_url,
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

// === Stability Audio ===

export class StabilityAudioService extends MusicService {
  readonly name = 'stability-audio';
  readonly supportedModels = ['stable-audio-open-1.0', 'stable-audio-2.0'];

  private apiKey: string;
  private baseUrl = 'https://api.stability.ai/v2beta';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async generate(request: MusicGenerationRequest): Promise<MusicGenerationResponse> {
    const formData = new FormData();
    formData.append('prompt', request.prompt);
    formData.append('seconds', String(request.duration || 30));
    formData.append('seed', String(request.seed || 0));

    const res = await fetch(`${this.baseUrl}/audio/generation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Stability audio error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: `stability-audio-${Date.now()}`,
      status: 'completed',
      url: data.audio,
      duration: request.duration || 30,
      format: 'mp3',
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/user/account`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// === Mureka (昆仑万维) ===

export class MurekaService extends MusicService {
  readonly name = 'mureka';
  readonly supportedModels = ['mureka-v1'];

  private apiKey: string;
  private baseUrl = 'https://api.mureka.ai/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async generate(request: MusicGenerationRequest): Promise<MusicGenerationResponse> {
    const res = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: request.prompt,
        model: request.model || 'mureka-v1',
        duration: request.duration || 30,
        genre: request.genre,
        mood: request.mood,
        seed: request.seed,
      }),
    });

    if (!res.ok) {
      throw new Error(`Mureka error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      id: data.id,
      status: 'pending',
    };
  }

  async getStatus(id: string): Promise<MusicGenerationResponse> {
    const res = await fetch(`${this.baseUrl}/generate/${id}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const data = await res.json();
    return {
      id,
      status: data.status,
      url: data.audio_url,
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

export class MusicServiceRegistry {
  private services: Map<string, MusicService> = new Map();

  register(service: MusicService): void {
    this.services.set(service.name, service);
  }

  get(name: string): MusicService | undefined {
    return this.services.get(name);
  }

  list(): string[] {
    return Array.from(this.services.keys());
  }
}

export const musicServices = new MusicServiceRegistry();
