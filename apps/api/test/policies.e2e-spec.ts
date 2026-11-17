import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { QueueEvents } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { Database } from '../src/db/database.module.js';
import { policyChunks } from '../src/db/schema.js';
import { PolicyIngestion } from '../src/streambox/policy-ingestion.js';
import { POLICY_QUEUE, createPolicyQueue, createPolicyWorker, redisConnection } from '../src/streambox/policy-queue.js';
import { PolicyService } from '../src/streambox/policy.service.js';
import { WordHashEmbedder } from '../src/streambox/testing.js';
import { createTestApp } from './setup.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Ingestion and hybrid search against the real database, with a stand-in embedder.
describe('Policy ingestion and search (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let ingestion: PolicyIngestion;
  let search: PolicyService;
  let directory: string;

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
    search = app.get(PolicyService);
    directory = await mkdtemp(path.join(tmpdir(), 'policies-'));
    await writeFile(
      path.join(directory, 'refunds.md'),
      '# Refund policy\n\n## Duplicate charges\nIf you were charged twice, the extra charge is refunded.\n\n## The 7-day window\nFull refund within 7 days of the charge.',
    );
    await writeFile(
      path.join(directory, 'plans.md'),
      '# Plans\n\n## Downgrades\nA downgrade takes effect at the next billing period.',
    );
    ingestion = new PolicyIngestion(db, new WordHashEmbedder(), directory);
  });
  beforeEach(() => db.delete(policyChunks));
  afterAll(() => app.close());

  it('stores each section with its embedding', async () => {
    expect(await ingestion.ingestDocument('refunds.md')).toBe(2);

    const rows = await db.select().from(policyChunks);
    expect(rows.map((row) => row.heading)).toEqual([
      'Refund policy: Duplicate charges',
      'Refund policy: The 7-day window',
    ]);
    expect(rows[0].embedding).toHaveLength(384);
  });

  it('replaces a document instead of duplicating it when ingested again', async () => {
    await ingestion.ingestDocument('refunds.md');
    await ingestion.ingestDocument('plans.md');
    await ingestion.ingestDocument('refunds.md');

    expect(await db.select().from(policyChunks)).toHaveLength(3);
  });

  it('refuses a document name that points outside the policies folder', async () => {
    await expect(ingestion.ingestDocument('../secrets.md')).rejects.toThrow('Invalid document name');
  });

  it('finds sections by embedding and drops unrelated ones', async () => {
    await ingestion.ingestDocument('refunds.md');
    await ingestion.ingestDocument('plans.md');

    const [first] = await search.semanticSearch('extra charge refunded when charged twice');
    expect(first.heading).toBe('Refund policy: Duplicate charges');
    expect(await search.semanticSearch('zebra giraffe elephant')).toEqual([]);
  });

  it('ignores sections that have no embedding yet in the semantic search', async () => {
    await ingestion.ingestDocument('plans.md');
    await db.update(policyChunks).set({ embedding: null }).where(eq(policyChunks.document, 'plans.md'));

    expect(await search.semanticSearch('downgrade next billing period')).toEqual([]);
    // The keyword half of the hybrid search still finds it.
    expect(await search.search('downgrade next billing period')).toHaveLength(1);
  });

  it('merges keyword and meaning results into one ranking', async () => {
    await ingestion.ingestDocument('refunds.md');
    await ingestion.ingestDocument('plans.md');

    const results = await search.search('refund for a duplicate charge', 2);
    expect(results[0].heading).toBe('Refund policy: Duplicate charges');
    expect(results).toHaveLength(2);
  });

  it('processes documents through the queue', async () => {
    const connection = redisConnection(REDIS_URL);
    const queue = createPolicyQueue(connection);
    const worker = createPolicyWorker(connection, ingestion);
    const events = new QueueEvents(POLICY_QUEUE, { connection });
    try {
      const job = await queue.add('ingest', { document: 'plans.md' });
      expect(await job.waitUntilFinished(events, 15000)).toEqual({ sections: 1 });
      expect(await db.select().from(policyChunks)).toHaveLength(1);
    } finally {
      await events.close();
      await worker.close();
      await queue.close();
      await connection.quit();
    }
  });
});
