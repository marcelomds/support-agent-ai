import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';
import { policyChunks } from '../db/schema.js';

export interface PolicyChunk {
  document: string;
  heading: string;
  content: string;
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

@Injectable()
export class PolicyService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Keyword search (Postgres full-text search) over the policy sections.
   * Any word may match; sections matching more words rank higher.
   */
  async search(query: string, limit = 3): Promise<PolicyChunk[]> {
    const words = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    if (words.length === 0) return [];
    const tsquery = sql`to_tsquery('english', ${words.join(' | ')})`;
    return this.db
      .select({
        document: policyChunks.document,
        heading: policyChunks.heading,
        content: policyChunks.content,
      })
      .from(policyChunks)
      .where(sql`${policyChunks.searchVector} @@ ${tsquery}`)
      .orderBy(sql`ts_rank(${policyChunks.searchVector}, ${tsquery}) desc`)
      .limit(limit);
  }
}
