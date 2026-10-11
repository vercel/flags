import { defineConfig } from '@playwright/test';

// A fixed test secret for the overrides, 32 bytes as base64url
export const FLAGS_SECRET = 'dGhpcy1pcy1hLXRlc3Qtc2VjcmV0LWZvci1mbGFncyE';

// The tests only send HTTP requests, so they need no browser. Run
// `pnpm test:e2e`, which builds the app first.
export default defineConfig({
  testDir: './e2e',
  reporter: 'list',
  projects: [
    {
      name: 'build',
      testMatch: 'build.spec.ts',
      use: { baseURL: 'http://localhost:4350' },
    },
    {
      name: 'dev',
      testMatch: 'dev.spec.ts',
      use: { baseURL: 'http://localhost:4351' },
    },
  ],
  webServer: [
    {
      command: 'pnpm start',
      url: 'http://localhost:4350/api/flags',
      env: { PORT: '4350', FLAGS_SECRET },
      reuseExistingServer: false,
    },
    {
      command: 'pnpm dev --port 4351',
      url: 'http://localhost:4351/api/flags',
      env: { FLAGS_SECRET },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
