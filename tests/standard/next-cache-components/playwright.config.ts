import { defineConfig } from '@playwright/test';

// The tests start `next dev` themselves, because they read its output: in
// development, Next.js validates each render in stages, and logs the errors
// of the prerender, e.g. for Date.now(). They need no browser.
export default defineConfig({
  testDir: './e2e',
  reporter: 'list',
  workers: 1,
  timeout: 60_000,
});
