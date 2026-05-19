import { describe, it, expect } from 'vitest';
import { BatchJob, BatchProcessor, type BatchRequest } from '../src/batch/processor';

describe('BatchJob', () => {
  it('creates a batch job with pending status', () => {
    const requests: BatchRequest[] = [
      { id: 'r1', payload: 1 },
      { id: 'r2', payload: 2 },
    ];
    const job = new BatchJob({ id: 'job1', requests });

    expect(job.id).toBe('job1');
    expect(job.status).toBe('pending');
    expect(job.requests.length).toBe(2);
    expect(job.responses.length).toBe(0);
  });

  it('processes all requests successfully', async () => {
    const requests: BatchRequest[] = [
      { id: 'r1', payload: 1 },
      { id: 'r2', payload: 2 },
    ];
    const job = new BatchJob({ id: 'job1', requests });
    job.setProcessor(async (payload) => (payload as number) * 2);

    const results = await job.run();
    expect(job.status).toBe('completed');
    expect(results.length).toBe(2);
    expect(results[0].success).toBe(true);
    expect(results[0].data).toBe(2);
    expect(results[1].data).toBe(4);
  });

  it('handles processor errors', async () => {
    const requests: BatchRequest[] = [
      { id: 'r1', payload: 'ok' },
      { id: 'r2', payload: 'fail' },
    ];
    const job = new BatchJob({ id: 'job1', requests });
    job.setProcessor(async (payload) => {
      if (payload === 'fail') throw new Error('Intentional failure');
      return payload;
    });

    const results = await job.run();
    expect(job.status).toBe('failed');
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].error).toContain('Intentional failure');
  });

  it('retries failed requests', async () => {
    let attempts = 0;
    const requests: BatchRequest[] = [{ id: 'r1', payload: 'x' }];
    const job = new BatchJob({ id: 'job1', requests, retryCount: 2 });
    job.setProcessor(async () => {
      attempts++;
      if (attempts < 3) throw new Error('Retry me');
      return 'success';
    });

    const results = await job.run();
    expect(results[0].success).toBe(true);
    expect(results[0].data).toBe('success');
  });

  it('processes with concurrency', async () => {
    const requests: BatchRequest[] = [
      { id: 'r1', payload: 1 },
      { id: 'r2', payload: 2 },
      { id: 'r3', payload: 3 },
    ];
    const job = new BatchJob({ id: 'job1', requests, concurrency: 2 });
    job.setProcessor(async (payload) => (payload as number) * 10);

    const results = await job.run();
    expect(results.length).toBe(3);
    expect(results.map((r) => r.data)).toEqual([10, 20, 30]);
  });

  it('cancels execution', async () => {
    const requests: BatchRequest[] = [
      { id: 'r1', payload: 1 },
      { id: 'r2', payload: 2 },
    ];
    const job = new BatchJob({ id: 'job1', requests });
    job.setProcessor(async () => {
      job.cancel();
      return 'done';
    });

    const results = await job.run();
    expect(job.status).toBe('cancelled');
  });

  it('throws if processor is not set', async () => {
    const job = new BatchJob({ id: 'job1', requests: [] });
    await expect(job.run()).rejects.toThrow('No processor set');
  });

  it('throws if already running', async () => {
    const job = new BatchJob({ id: 'job1', requests: [{ id: 'r1', payload: 1 }] });
    job.setProcessor(async () => 'ok');

    const p1 = job.run();
    await expect(job.run()).rejects.toThrow('already running');
    await p1;
  });

  it('reports progress', async () => {
    const requests: BatchRequest[] = [
      { id: 'r1', payload: 1 },
      { id: 'r2', payload: 2 },
    ];
    const job = new BatchJob({ id: 'job1', requests });
    job.setProcessor(async () => 'ok');

    const progressBefore = job.getProgress();
    expect(progressBefore.total).toBe(2);
    expect(progressBefore.completed).toBe(0);

    await job.run();
    const progressAfter = job.getProgress();
    expect(progressAfter.completed).toBe(2);
  });
});

describe('BatchProcessor', () => {
  it('creates and retrieves jobs', () => {
    const processor = new BatchProcessor();
    const job = processor.createJob({ id: 'j1', requests: [] });

    expect(job.id).toBe('j1');
    expect(processor.getJob('j1')).toBe(job);
  });

  it('removes jobs', () => {
    const processor = new BatchProcessor();
    processor.createJob({ id: 'j1', requests: [] });

    expect(processor.removeJob('j1')).toBe(true);
    expect(processor.getJob('j1')).toBeUndefined();
  });

  it('lists all jobs', () => {
    const processor = new BatchProcessor();
    processor.createJob({ id: 'j1', requests: [] });
    processor.createJob({ id: 'j2', requests: [] });

    expect(processor.listJobs().length).toBe(2);
  });

  it('runs a job with processor', async () => {
    const processor = new BatchProcessor();
    processor.createJob({
      id: 'j1',
      requests: [
        { id: 'r1', payload: 5 },
        { id: 'r2', payload: 10 },
      ],
    });

    const results = await processor.runJob('j1', async (payload) => (payload as number) * 2);
    expect(results.length).toBe(2);
    expect(results[0].data).toBe(10);
    expect(results[1].data).toBe(20);
  });

  it('throws for unknown job', async () => {
    const processor = new BatchProcessor();
    await expect(
      processor.runJob('missing', async () => 'ok')
    ).rejects.toThrow('Job not found');
  });
});
