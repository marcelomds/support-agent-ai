/**
 * Loads the policy documents into the database, one row per section.
 * Usage: pnpm --filter api policies:ingest
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../db/schema.js';
import { chunkPolicy } from './policy.service.js';

const url =
  process.env.DATABASE_URL ??
  'postgres://streambox:streambox@localhost:5432/streambox';
const dir = path.join(import.meta.dirname, 'policies');

const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { schema });

const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
const chunks = (
  await Promise.all(
    files.map(async (file) =>
      chunkPolicy(file, await readFile(path.join(dir, file), 'utf8')),
    ),
  )
).flat();

await db.transaction(async (tx) => {
  await tx.delete(schema.policyChunks);
  await tx.insert(schema.policyChunks).values(chunks);
});

console.log(`Ingested ${chunks.length} policy sections from ${files.length} documents.`);
await pool.end();
