import { Inject, Injectable, Logger } from '@nestjs/common';
import { cosineDistance, isNotNull, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';
import { policyChunks } from '../db/schema.js';
import { Embedder } from './embedder.js';

export interface PolicyChunk {
  document: string;
  heading: string;
  content: string;
}

interface RankedChunk extends PolicyChunk {
  id: number;
}

/** Splits a markdown policy into one chunk per "##" section. */
export function chunkPolicy(document: string, markdown: string): PolicyChunk[] {
  const title = /^# (.+)$/m.exec(markdown)?.[1] ?? document;
  return markdown
    .split(/^## /m)
    .slice(1)
    .map((section) => {
      const [heading, ...body] = section.split('\n');
      return {
        document,
        heading: `${title}: ${heading.trim()}`,
        content: body.join('\n').trim(),
      };
    })
    .filter((chunk) => chunk.content.length > 0);
}

/**
 * Reciprocal rank fusion: merges several ranked lists into one.
 * An item scores 1 / (k + position) in each list it appears in, so something
 * ranked well by both searches beats something ranked first by only one.
 * It needs no tuning and does not care that the two searches use different scales.
 */
export function fuseRankings<T extends { id: number }>(lists: T[][], limit: number, k = 60): T[] {
  const scored = new Map<number, { item: T; score: number }>();
  for (const list of lists) {
    list.forEach((item, position) => {
      const entry = scored.get(item.id) ?? { item, score: 0 };
      entry.score += 1 / (k + position + 1);
      scored.set(item.id, entry);
    });
  }
  return [...scored.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}

const CANDIDATES = 10;
const columns = {
  id: policyChunks.id,
  document: policyChunks.document,
  heading: policyChunks.heading,
  content: policyChunks.content,
};

@Injectable()
export class PolicyService {
  private readonly logger = new Logger(PolicyService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly embedder: Embedder,
  ) {}

  /**
   * Hybrid search: by keyword and by meaning, merged into one ranking.
   * Keywords catch exact terms ("duplicate charge"); meaning catches
   * paraphrases and other languages ("quero meu dinheiro de volta").
   */
  async search(query: string, limit = 3): Promise<PolicyChunk[]> {
    if (!/[\p{L}\p{N}]/u.test(query)) return [];
    const [byKeyword, byMeaning] = await Promise.all([
      this.keywordSearch(query),
      this.semanticSearch(query),
    ]);
    return fuseRankings([byKeyword, byMeaning], limit).map(
      ({ document, heading, content }) => ({ document, heading, content }),
    );
  }

  /** Postgres full-text search. Any word may match; more matches rank higher. */
  async keywordSearch(query: string): Promise<RankedChunk[]> {
    const words = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    if (words.length === 0) return [];
    const tsquery = sql`to_tsquery('english', ${words.join(' | ')})`;
    return this.db
      .select(columns)
      .from(policyChunks)
      .where(sql`${policyChunks.searchVector} @@ ${tsquery}`)
      .orderBy(sql`ts_rank(${policyChunks.searchVector}, ${tsquery}) desc`)
      .limit(CANDIDATES);
  }

  /** Nearest sections by embedding (pgvector), dropping the ones too far to be related. */
  async semanticSearch(query: string): Promise<RankedChunk[]> {
    let vector: number[];
    try {
      [vector] = await this.embedder.embed([query], 'query');
    } catch (error) {
      // Search still works by keyword if the embedding model is unavailable.
      this.logger.warn(`Semantic search skipped: ${(error as Error).message}`);
      return [];
    }
    const distance = cosineDistance(policyChunks.embedding, vector);
    const rows = await this.db
      .select({ ...columns, distance })
      .from(policyChunks)
      .where(isNotNull(policyChunks.embedding))
      .orderBy(distance)
      .limit(CANDIDATES);
    return rows.filter((row) => 1 - Number(row.distance) >= this.embedder.minSimilarity);
  }
}
