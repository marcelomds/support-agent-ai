import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export const DB = Symbol('DB');
export const PG_POOL = Symbol('PG_POOL');
export type Database = NodePgDatabase<typeof schema>;
/** An open transaction. Has the same query methods as the database. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Anything a query can run on: the database itself or an open transaction. */
export type Executor = Database | Transaction;

class DryRunFinished extends Error {}

/**
 * Runs `work` inside a transaction and always rolls it back, returning what it
 * computed. This is how an action is previewed: the real code path runs, with
 * the real rules, and nothing is kept.
 */
export async function dryRun<T>(db: Database, work: (tx: Transaction) => Promise<T>): Promise<T> {
  let result: T;
  try {
    await db.transaction(async (tx) => {
      result = await work(tx);
      throw new DryRunFinished();
    });
  } catch (error) {
    if (!(error instanceof DryRunFinished)) throw error;
  }
  return result!;
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Pool({ connectionString: config.getOrThrow<string>('DATABASE_URL') }),
    },
    {
      provide: DB,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
    },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
