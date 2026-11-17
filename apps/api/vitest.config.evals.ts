import { defineConfig } from 'vitest/config';

/**
 * Evals call the real model, so they cost money and need ANTHROPIC_API_KEY.
 * They are not part of `pnpm test`. Run them with: pnpm --filter api evals
 */
const EVAL_DATABASE_URL =
  process.env.EVAL_DATABASE_URL ??
  'postgres://streambox:streambox@localhost:5432/streambox_eval';
process.env.SETUP_DATABASE_URL = EVAL_DATABASE_URL;

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['evals/**/*.eval.ts'],
    globalSetup: './test/global-setup.ts',
    env: { DATABASE_URL: EVAL_DATABASE_URL },
    fileParallelism: false,
    // A hard ceiling per case, so a hung request cannot block the run.
    testTimeout: 180_000,
    hookTimeout: 600_000,
  },
});
