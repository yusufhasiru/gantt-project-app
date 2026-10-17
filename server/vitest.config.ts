import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/tests/**/*.test.ts'],
    fileParallelism: false,
    globalSetup: './src/tests/globalSetup.ts',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./test.db',
      JWT_SECRET: 'test-secret-yang-cukup-panjang-untuk-pengujian-123456',
    },
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
