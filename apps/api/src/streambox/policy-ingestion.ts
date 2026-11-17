import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/database.module.js';
import { policyChunks } from '../db/schema.js';
import type { Embedder } from './embedder.js';
import { chunkPolicy } from './policy.service.js';

export const POLICIES_DIR = path.join(import.meta.dirname, 'policies');

/**
 * Ingestion: read a policy document, split it into sections, compute an
 * embedding for each section, and store everything.
 */
export class PolicyIngestion {
  constructor(
    private readonly db: Database,
    private readonly embedder: Embedder,
    private readonly directory = POLICIES_DIR,
  ) {}

  async listDocuments(): Promise<string[]> {
    return (await readdir(this.directory)).filter((file) => file.endsWith('.md')).sort();
  }

  /** Replaces every section of one document. Safe to run again (idempotent). */
  async ingestDocument(document: string): Promise<number> {
    if (path.basename(document) !== document) throw new Error(`Invalid document name: ${document}`);
    const markdown = await readFile(path.join(this.directory, document), 'utf8');
    const chunks = chunkPolicy(document, markdown);
    const embeddings = await this.embedder.embed(
      chunks.map((chunk) => `${chunk.heading}\n${chunk.content}`),
      'passage',
    );

    await this.db.transaction(async (tx) => {
      await tx.delete(policyChunks).where(eq(policyChunks.document, document));
      if (chunks.length > 0) {
        await tx
          .insert(policyChunks)
          .values(chunks.map((chunk, i) => ({ ...chunk, embedding: embeddings[i] })));
      }
    });
    return chunks.length;
  }
}
