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
      testMatch: /(build|conformance)\.spec\.ts/,
      use: { baseURL: 'http://localhost:4330' },
    },
    {
      name: 'platform',
      testMatch: 'platform.spec.ts',
      use: { baseURL: 'http://localhost:4332' },
    },
    {
      name: 'dev',
      testMatch: /(dev|conformance)\.spec\.ts/,
      use: { baseURL: 'http://localhost:4331' },
    },
  ],
  webServer: [
    {
      command: 'node build/index.js',
      url: 'http://localhost:4330/',
      env: { PORT: '4330', FLAGS_SECRET },
      reuseExistingServer: false,
    },
    {
      command: 'node build-platform/index.js',
      url: 'http://localhost:4332/',
      env: { PORT: '4332', TEST_VARIANT: 'platform' },
      reuseExistingServer: false,
    },
    {
      command: 'pnpm dev --port 4331 --strictPort',
      url: 'http://localhost:4331/',
      env: { FLAGS_SECRET },
      reuseExistingServer: false,
    },
  ],
});
