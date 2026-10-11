import { defineConfig } from '@playwright/test';

// A fixed test secret for the overrides, 32 bytes as base64url
export const FLAGS_SECRET = 'dGhpcy1pcy1hLXRlc3Qtc2VjcmV0LWZvci1mbGFncyE';

// The tests only send HTTP requests, so they need no browser. Run
// `pnpm test:e2e`, which builds both variants first.
export default defineConfig({
  testDir: './e2e',
  reporter: 'list',
  projects: [
    {
      name: 'app',
      testMatch: 'app.spec.ts',
      use: { baseURL: 'http://localhost:4310' },
    },
    {
      name: 'platform',
      testMatch: 'platform.spec.ts',
      use: { baseURL: 'http://localhost:4311' },
    },
  ],
  webServer: [
    {
      command: 'pnpm start',
      url: 'http://localhost:4310/api/flags',
      env: { FLAGS_SECRET },
      reuseExistingServer: false,
    },
    {
      command: 'pnpm start:platform',
      url: 'http://localhost:4311/api/flags',
      reuseExistingServer: false,
    },
  ],
});
