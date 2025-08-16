import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    name: 'integration',
    include: [
      'packages/api/src/__tests__/integration/**/*.test.ts',
      'packages/api/src/__tests__/performance/**/*.test.ts',
      'packages/api/src/__tests__/chaos/**/*.test.ts',
      'packages/api/src/__tests__/ci/**/*.test.ts'
    ],
    exclude: [
      'node_modules/**',
      'packages/*/node_modules/**',
      'packages/*/dist/**'
    ],
    testTimeout: 60000, // 60 seconds for integration tests
    hookTimeout: 30000, // 30 seconds for setup/teardown
    teardownTimeout: 30000,
    maxConcurrency: 1, // Run integration tests sequentially
    environment: 'node',
    globals: true,
    setupFiles: ['packages/api/src/__tests__/integration/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'packages/*/node_modules/**',
        'packages/*/dist/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/test/**',
        '**/__tests__/**'
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70
        }
      }
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  },
  resolve: {
    alias: {
      '@api': resolve(__dirname, 'packages/api/src'),
      '@ml': resolve(__dirname, 'packages/ml/src'),
      '@shared': resolve(__dirname, 'packages/shared/src'),
      '@frontend': resolve(__dirname, 'packages/frontend/src')
    }
  }
});