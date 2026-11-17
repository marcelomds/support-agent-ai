import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL } from './test/test-database.js';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // The e2e tests use their own database and run one file at a time.
    globalSetup: './test/global-setup.ts',
    env: { DATABASE_URL: TEST_DATABASE_URL },
    fileParallelism: false,
  },
});
