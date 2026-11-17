/**
 * Runs once before the e2e tests: creates a separate test database and applies
 * the migrations, so the tests never touch the development data.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';
import { TEST_DATABASE_URL } from './test-database.js';

export default async function setup() {
  // The eval run points this at its own database (see vitest.config.evals.ts).
  const target = process.env.SETUP_DATABASE_URL ?? TEST_DATABASE_URL;
  const url = new URL(target);
  const database = url.pathname.slice(1);

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const existing = await admin.query('select 1 from pg_database where datname = $1', [database]);
  if (existing.rowCount === 0) await admin.query(`create database "${database}"`);
  await admin.end();

  const client = new Client({ connectionString: target });
  await client.connect();
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  await client.end();
}
