import { defineConfig } from '@playwright/test';

// The tests only send HTTP requests, so they need no browser. Run
// `pnpm test:e2e`, which writes the manifest first.
export default defineConfig({
  testDir: './e2e',
  reporter: 'list',
  use: { baseURL: 'http://localhost:4340' },
  webServer: {
    command: 'pnpm start',
    url: 'http://localhost:4340/',
    env: { PORT: '4340' },
    reuseExistingServer: false,
  },
});
