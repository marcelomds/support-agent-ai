import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { MODEL_CLIENT, type ModelClient } from '../src/agent/model-client.js';
import { AppModule } from '../src/app.module.js';
import { DB, type Database } from '../src/db/database.module.js';
import { resetAndSeed } from '../src/db/seed-db.js';
import { Embedder } from '../src/streambox/embedder.js';
import { Clock } from '../src/streambox/rules.js';
import { WordHashEmbedder } from '../src/streambox/testing.js';

/** Every e2e test sees the sample data as of this moment. */
export const NOW = new Date('2026-01-15T12:00:00Z');

/** Boots the real app against the real database, with a fixed clock and a fake model. */
export async function createTestApp(model?: ModelClient) {
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue({ now: () => NOW })
    // The real embedding model needs a 120 MB download; tests use a stand-in.
    .overrideProvider(Embedder)
    .useValue(new WordHashEmbedder());
  if (model) builder.overrideProvider(MODEL_CLIENT).useValue(model);

  const moduleRef = await builder.compile();
  const app: INestApplication<App> = moduleRef.createNestApplication();
  await app.init();
  const db = app.get<Database>(DB);
  return { app, db, reseed: () => resetAndSeed(db, NOW) };
}

/** Sample customers by id (see src/db/seed-data.ts). */
export const CUSTOMER = {
  alice: 1, bruno: 2, carla: 3, david: 4, elena: 5, felipe: 6,
  grace: 7, hiro: 8, ines: 9, jonas: 10, kate: 11,
} as const;
