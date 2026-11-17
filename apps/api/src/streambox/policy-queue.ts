/**
 * The ingestion queue (BullMQ on Redis).
 *
 * Embedding a document is slow compared with a web request, and it can fail
 * (model download, out of memory). A queue lets the request that triggers it
 * return immediately, runs the work in a separate worker, and retries
 * failures with a growing delay instead of losing them.
 */
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import type { PolicyIngestion } from './policy-ingestion.js';

export const POLICY_QUEUE = 'policy-ingestion';

export interface IngestJob {
  document: string;
}
export interface IngestResult {
  sections: number;
}

/** One Redis client, shared by the queue, the worker and the event listener. Close it with `quit()`. */
export function redisConnection(url: string): Redis {
  // BullMQ requires this setting on clients it uses for blocking reads.
  return new Redis(url, { maxRetriesPerRequest: null });
}

export function createPolicyQueue(connection: Redis) {
  return new Queue<IngestJob, IngestResult>(POLICY_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  });
}

export function createPolicyWorker(connection: Redis, ingestion: PolicyIngestion) {
  return new Worker<IngestJob, IngestResult>(
    POLICY_QUEUE,
    async (job: Job<IngestJob>) => ({
      sections: await ingestion.ingestDocument(job.data.document),
    }),
    // One at a time: the embedding model already uses every CPU core.
    { connection, concurrency: 1 },
  );
}
