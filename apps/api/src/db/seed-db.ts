import { sql } from 'drizzle-orm';
import type { Database } from './database.module.js';
import * as schema from './schema.js';
import { buildSeedData } from './seed-data.js';

/**
 * Empties the domain and agent tables and loads the sample data.
 * Policy documents are kept; they are loaded by `policies:ingest`.
 */
export async function resetAndSeed(db: Database, now: Date) {
  const data = buildSeedData(now);
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`truncate table audit_log, messages, conversations, refunds, payments, subscriptions, customers, plans restart identity cascade`,
    );
    await tx.insert(schema.plans).values(data.plans);
    await tx.insert(schema.customers).values(data.customers);
    await tx.insert(schema.subscriptions).values(data.subscriptions);
    await tx.insert(schema.payments).values(data.payments);

    // Rows were inserted with explicit ids; move the identity sequences past them.
    for (const table of ['plans', 'customers', 'subscriptions']) {
      await tx.execute(
        sql`select setval(pg_get_serial_sequence(${table}, 'id'), (select max(id) from ${sql.identifier(table)}))`,
      );
    }
  });
  return data;
}
