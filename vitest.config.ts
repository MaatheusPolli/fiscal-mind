import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      include: ['packages/core/src/ingest/**', 'packages/core/src/retrieval/**'],
      thresholds: { lines: 80 },
    },
  },
});
