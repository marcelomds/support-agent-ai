/**
 * Resets the database and loads the sample data.
 * Usage: pnpm --filter api db:seed
 * Set SEED_NOW (ISO date) to make the relative dates deterministic.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';
import { resetAndSeed } from './seed-db.js';

const url =
  process.env.DATABASE_URL ??
  'postgres://streambox:streambox@localhost:5432/streambox';
const now = process.env.SEED_NOW ? new Date(process.env.SEED_NOW) : new Date();

const pool = new Pool({ connectionString: url });
const data = await resetAndSeed(drizzle(pool, { schema }), now);

console.log(
  `Seeded ${data.plans.length} plans, ${data.customers.length} customers, ` +
    `${data.subscriptions.length} subscriptions, ${data.payments.length} payments ` +
    `(reference date: ${now.toISOString()}).`,
);
await pool.end();
