import { defineConfig } from '@playwright/test';

// The tests only send HTTP requests, so they need no browser. Run
// `pnpm test:e2e`, which builds the app first.
export default defineConfig({
  testDir: './e2e',
  reporter: 'list',
  projects: [
    {
      name: 'build',
      testMatch: 'build.spec.ts',
      use: { baseURL: 'http://localhost:4330' },
    },
    {
      name: 'dev',
      testMatch: 'dev.spec.ts',
      use: { baseURL: 'http://localhost:4331' },
    },
  ],
  webServer: [
    {
      command: 'node build/index.js',
      url: 'http://localhost:4330/',
      env: { PORT: '4330' },
      reuseExistingServer: false,
    },
    {
      command: 'pnpm dev --port 4331 --strictPort',
      url: 'http://localhost:4331/',
      reuseExistingServer: false,
    },
  ],
});
