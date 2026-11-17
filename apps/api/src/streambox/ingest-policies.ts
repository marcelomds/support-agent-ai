/**
 * Puts one job per policy document on the queue and processes them.
 *
 *   pnpm --filter api policies:ingest            enqueue, process here, exit
 *   pnpm --filter api policies:ingest --enqueue  only enqueue (a worker elsewhere picks them up)
 *   pnpm --filter api policies:ingest --worker   only run a worker, until stopped
 *
 * In production the worker is its own long-running process; the first form
 * runs both ends in one command so local setup stays a single step.
 */
import { QueueEvents } from 'bullmq';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../db/schema.js';
import { LocalEmbedder } from './embedder.js';
import { PolicyIngestion } from './policy-ingestion.js';
import { POLICY_QUEUE, createPolicyQueue, createPolicyWorker, redisConnection } from './policy-queue.js';

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://streambox:streambox@localhost:5432/streambox';
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const mode = process.argv.includes('--enqueue')
  ? 'enqueue'
  : process.argv.includes('--worker')
    ? 'worker'
    : 'both';

const pool = new Pool({ connectionString: databaseUrl });
const ingestion = new PolicyIngestion(
  drizzle(pool, { schema }),
  new LocalEmbedder(process.env.EMBEDDING_MODEL),
);

const connection = redisConnection(redisUrl);
const worker = mode === 'enqueue' ? undefined : createPolicyWorker(connection, ingestion);
worker?.on('completed', (job, result) =>
  console.log(`  done    ${job.data.document}: ${result.sections} sections`),
);
worker?.on('failed', (job, error) =>
  console.log(`  failed  ${job?.data.document} (attempt ${job?.attemptsMade}): ${error.message}`),
);

if (mode === 'worker') {
  console.log(`Worker listening on queue "${POLICY_QUEUE}". Press Ctrl+C to stop.`);
} else {
  const queue = createPolicyQueue(connection);
  const documents = await ingestion.listDocuments();
  const jobs = await queue.addBulk(
    documents.map((document) => ({ name: 'ingest', data: { document } })),
  );
  console.log(`Queued ${jobs.length} documents on "${POLICY_QUEUE}".`);

  let failed = 0;
  if (mode === 'both') {
    console.log('Processing (the first run downloads the embedding model, about 120 MB)...');
    const events = new QueueEvents(POLICY_QUEUE, { connection });
    const results = await Promise.allSettled(jobs.map((job) => job.waitUntilFinished(events)));
    failed = results.filter((result) => result.status === 'rejected').length;
    const sections = results.reduce(
      (total, result) => total + (result.status === 'fulfilled' ? result.value.sections : 0),
      0,
    );
    console.log(`Ingested ${sections} policy sections from ${documents.length - failed} documents.`);
    await events.close();
    await worker?.close();
  }
  await queue.close();
  await connection.quit();
  await pool.end();
  if (failed > 0) {
    console.error(`${failed} document(s) failed after 3 attempts.`);
    process.exit(1);
  }
}
