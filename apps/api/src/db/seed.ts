/**
 * Resets the domain tables and loads the sample data.
 * Usage: pnpm --filter api db:seed
 * Set SEED_NOW (ISO date) to make the relative dates deterministic.
 */
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';
import { buildSeedData } from './seed-data.js';

const url =
  process.env.DATABASE_URL ??
  'postgres://streambox:streambox@localhost:5432/streambox';
const now = process.env.SEED_NOW ? new Date(process.env.SEED_NOW) : new Date();

const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { schema });
const data = buildSeedData(now);

await db.transaction(async (tx) => {
  await tx.execute(
    sql`truncate table payments, subscriptions, customers, plans restart identity cascade`,
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

console.log(
  `Seeded ${data.plans.length} plans, ${data.customers.length} customers, ` +
    `${data.subscriptions.length} subscriptions, ${data.payments.length} payments ` +
    `(reference date: ${now.toISOString()}).`,
);
await pool.end();
