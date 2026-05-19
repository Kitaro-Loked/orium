/**
 * Orium - Fine-tuning Service
 * Unified interface for model fine-tuning APIs.
 */

export interface FineTuningJob {
  id: string;
  model: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  createdAt: string;
  finishedAt?: string;
  trainingFile?: string;
  validationFile?: string;
  hyperparameters?: {
    nEpochs?: number;
    batchSize?: number;
    learningRateMultiplier?: number;
  };
  trainedTokens?: number;
  resultFiles?: string[];
  error?: string;
}

export interface CreateFineTuningRequest {
  model: string;
  trainingFile: string; // file ID or path
  validationFile?: string;
  suffix?: string; // custom model name suffix
  hyperparameters?: {
    nEpochs?: number | 'auto';
    batchSize?: number | 'auto';
    learningRateMultiplier?: number | 'auto';
  };
}

export interface FineTuningEvent {
  id: string;
  createdAt: string;
  level: 'info' | 'warning' | 'error';
  message: string;
}

export abstract class FineTuningService {
  abstract readonly name: string;
  abstract readonly supportedModels: string[];

  abstract create(request: CreateFineTuningRequest): Promise<FineTuningJob>;
  abstract get(jobId: string): Promise<FineTuningJob>;
  abstract list(limit?: number): Promise<FineTuningJob[]>;
  abstract cancel(jobId: string): Promise<FineTuningJob>;
  abstract healthCheck(): Promise<boolean>;

  events?(jobId: string): Promise<FineTuningEvent[]> {
    throw new Error('Events not supported by this service');
  }

  delete?(jobId: string): Promise<void> {
    throw new Error('Delete not supported by this service');
  }
}

// === OpenAI Fine-tuning ===

export class OpenAIFineTuningService extends FineTuningService {
  readonly name = 'openai-finetune';
  readonly supportedModels = [
    'gpt-4o-2024-08-06',
    'gpt-4o-mini-2024-07-18',
    'gpt-3.5-turbo-0125',
    'gpt-3.5-turbo-1106',
    'babbage-002',
    'davinci-002',
  ];

  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async create(request: CreateFineTuningRequest): Promise<FineTuningJob> {
    const res = await fetch(`${this.baseUrl}/fine_tuning/jobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        training_file: request.trainingFile,
        validation_file: request.validationFile,
        suffix: request.suffix,
        hyperparameters: request.hyperparameters,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI fine-tuning error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return this.mapJob(data);
  }

  async get(jobId: string): Promise<FineTuningJob> {
    const res = await fetch(`${this.baseUrl}/fine_tuning/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const data = await res.json();
    return this.mapJob(data);
  }

  async list(limit = 20): Promise<FineTuningJob[]> {
    const res = await fetch(`${this.baseUrl}/fine_tuning/jobs?limit=${limit}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const data = await res.json();
    return data.data?.map((j: any) => this.mapJob(j)) || [];
  }

  async cancel(jobId: string): Promise<FineTuningJob> {
    const res = await fetch(`${this.baseUrl}/fine_tuning/jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const data = await res.json();
    return this.mapJob(data);
  }

  async events(jobId: string): Promise<FineTuningEvent[]> {
    const res = await fetch(`${this.baseUrl}/fine_tuning/jobs/${jobId}/events`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const data = await res.json();
    return data.data?.map((e: any) => ({
      id: e.id,
      createdAt: new Date(e.created_at * 1000).toISOString(),
      level: e.level,
      message: e.message,
    })) || [];
  }

  private mapJob(data: any): FineTuningJob {
    return {
      id: data.id,
      model: data.model,
      status: data.status,
      createdAt: new Date(data.created_at * 1000).toISOString(),
      finishedAt: data.finished_at ? new Date(data.finished_at * 1000).toISOString() : undefined,
      trainingFile: data.training_file,
      validationFile: data.validation_file,
      hyperparameters: data.hyperparameters,
      trainedTokens: data.trained_tokens,
      resultFiles: data.result_files,
      error: data.error?.message,
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

// === Together AI Fine-tuning ===

export class TogetherFineTuningService extends FineTuningService {
  readonly name = 'together-finetune';
  readonly supportedModels = [
    'meta-llama/Llama-3.1-8B-Instruct',
    'meta-llama/Llama-3.1-70B-Instruct',
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
    'Qwen/Qwen2.5-72B-Instruct',
  ];

  private apiKey: string;
  private baseUrl = 'https://api.together.xyz/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async create(request: CreateFineTuningRequest): Promise<FineTuningJob> {
    const res = await fetch(`${this.baseUrl}/fine-tunes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        training_file: request.trainingFile,
        validation_file: request.validationFile,
        suffix: request.suffix,
        n_epochs: request.hyperparameters?.nEpochs,
        batch_size: request.hyperparameters?.batchSize,
        learning_rate: request.hyperparameters?.learningRateMultiplier,
      }),
    });

    if (!res.ok) {
      throw new Error(`Together fine-tuning error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return this.mapJob(data);
  }

  async get(jobId: string): Promise<FineTuningJob> {
    const res = await fetch(`${this.baseUrl}/fine-tunes/${jobId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const data = await res.json();
    return this.mapJob(data);
  }

  async list(limit = 20): Promise<FineTuningJob[]> {
    const res = await fetch(`${this.baseUrl}/fine-tunes?limit=${limit}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const data = await res.json();
    return data.data?.map((j: any) => this.mapJob(j)) || [];
  }

  async cancel(jobId: string): Promise<FineTuningJob> {
    const res = await fetch(`${this.baseUrl}/fine-tunes/${jobId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const data = await res.json();
    return this.mapJob(data);
  }

  private mapJob(data: any): FineTuningJob {
    return {
      id: data.id,
      model: data.model,
      status: data.status,
      createdAt: data.created_at,
      finishedAt: data.finished_at,
      trainingFile: data.training_file,
      validationFile: data.validation_file,
      hyperparameters: {
        nEpochs: data.n_epochs,
        batchSize: data.batch_size,
        learningRateMultiplier: data.learning_rate,
      },
      trainedTokens: data.trained_tokens,
      resultFiles: data.result_files,
      error: data.error,
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

// === Fireworks AI Fine-tuning ===

export class FireworksFineTuningService extends FineTuningService {
  readonly name = 'fireworks-finetune';
  readonly supportedModels = [
    'accounts/fireworks/models/llama-v3p1-8b-instruct',
    'accounts/fireworks/models/llama-v3p1-70b-instruct',
    'accounts/fireworks/models/mistral-7b-instruct-v0p2',
  ];

  private apiKey: string;
  private baseUrl = 'https://api.fireworks.ai/inference/v1';

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async create(request: CreateFineTuningRequest): Promise<FineTuningJob> {
    const res = await fetch(`${this.baseUrl}/account/fineTuningJobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        dataset: request.trainingFile,
        validationDataset: request.validationFile,
        suffix: request.suffix,
        hyperparameters: request.hyperparameters,
      }),
    });

    if (!res.ok) {
      throw new Error(`Fireworks fine-tuning error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return this.mapJob(data);
  }

  async get(jobId: string): Promise<FineTuningJob> {
    const res = await fetch(`${this.baseUrl}/account/fineTuningJobs/${jobId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const data = await res.json();
    return this.mapJob(data);
  }

  async list(limit = 20): Promise<FineTuningJob[]> {
    const res = await fetch(`${this.baseUrl}/account/fineTuningJobs?limit=${limit}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const data = await res.json();
    return data.data?.map((j: any) => this.mapJob(j)) || [];
  }

  async cancel(jobId: string): Promise<FineTuningJob> {
    const res = await fetch(`${this.baseUrl}/account/fineTuningJobs/${jobId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const data = await res.json();
    return this.mapJob(data);
  }

  private mapJob(data: any): FineTuningJob {
    return {
      id: data.name || data.id,
      model: data.model,
      status: data.status,
      createdAt: data.createdAt,
      finishedAt: data.finishedAt,
      trainingFile: data.dataset,
      validationFile: data.validationDataset,
      hyperparameters: data.hyperparameters,
      error: data.error,
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

export class FineTuningServiceRegistry {
  private services: Map<string, FineTuningService> = new Map();

  register(service: FineTuningService): void {
    this.services.set(service.name, service);
  }

  get(name: string): FineTuningService | undefined {
    return this.services.get(name);
  }

  list(): string[] {
    return Array.from(this.services.keys());
  }
}

export const fineTuningServices = new FineTuningServiceRegistry();
