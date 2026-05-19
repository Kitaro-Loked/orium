/**
 * Orium - Batch Processor
 * Asynchronous batch job processing system.
 */

import { EventEmitter } from 'events';

export type BatchJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface BatchRequest {
  id: string;
  payload: unknown;
}

export interface BatchResponse {
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface BatchJobConfig {
  id: string;
  requests: BatchRequest[];
  concurrency?: number;
  retryCount?: number;
}

export class BatchJob extends EventEmitter {
  readonly id: string;
  readonly createdAt: Date;
  status: BatchJobStatus;
  requests: BatchRequest[];
  responses: BatchResponse[];
  completedAt?: Date;
  private concurrency: number;
  private retryCount: number;
  private processor?: (payload: unknown) => Promise<unknown>;
  private aborted = false;

  constructor(config: BatchJobConfig) {
    super();
    this.id = config.id;
    this.requests = [...config.requests];
    this.responses = [];
    this.status = 'pending';
    this.createdAt = new Date();
    this.concurrency = config.concurrency || 1;
    this.retryCount = config.retryCount || 0;
  }

  setProcessor(processor: (payload: unknown) => Promise<unknown>): void {
    this.processor = processor;
  }

  async run(): Promise<BatchResponse[]> {
    if (!this.processor) {
      throw new Error('No processor set for batch job');
    }
    if (this.status === 'running') {
      throw new Error('Batch job is already running');
    }

    this.status = 'running';
    this.emit('started', { jobId: this.id });
    this.aborted = false;

    const queue = [...this.requests];
    const results: BatchResponse[] = [];

    while (queue.length > 0 && !this.aborted) {
      const batch = queue.splice(0, this.concurrency);
      const batchPromises = batch.map((req) => this.processRequest(req));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    this.responses = results;

    if (this.aborted) {
      this.status = 'cancelled';
      this.emit('cancelled', { jobId: this.id });
    } else if (results.every((r) => r.success)) {
      this.status = 'completed';
      this.completedAt = new Date();
      this.emit('completed', { jobId: this.id, responses: results });
    } else {
      this.status = 'failed';
      this.completedAt = new Date();
      this.emit('failed', { jobId: this.id, responses: results });
    }

    return results;
  }

  private async processRequest(req: BatchRequest, attempt = 0): Promise<BatchResponse> {
    try {
      const data = await this.processor!(req.payload);
      return { requestId: req.id, success: true, data };
    } catch (err) {
      if (attempt < this.retryCount) {
        return this.processRequest(req, attempt + 1);
      }
      return { requestId: req.id, success: false, error: String(err) };
    }
  }

  cancel(): void {
    this.aborted = true;
  }

  getProgress(): { total: number; completed: number; failed: number } {
    return {
      total: this.requests.length,
      completed: this.responses.filter((r) => r.success).length,
      failed: this.responses.filter((r) => !r.success).length,
    };
  }
}

export class BatchProcessor extends EventEmitter {
  private jobs: Map<string, BatchJob> = new Map();

  createJob(config: BatchJobConfig): BatchJob {
    const job = new BatchJob(config);
    this.jobs.set(job.id, job);
    return job;
  }

  getJob(id: string): BatchJob | undefined {
    return this.jobs.get(id);
  }

  removeJob(id: string): boolean {
    return this.jobs.delete(id);
  }

  listJobs(): BatchJob[] {
    return Array.from(this.jobs.values());
  }

  async runJob(
    id: string,
    processor: (payload: unknown) => Promise<unknown>
  ): Promise<BatchResponse[]> {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`Job not found: ${id}`);
    job.setProcessor(processor);
    return job.run();
  }
}
