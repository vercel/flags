import { type ChildProcess, spawn } from 'node:child_process';
import { expect, test } from '@playwright/test';

// The app with cacheComponents and partialPrefetching. In development,
// Next.js prerenders each page with the request data, and logs an error if
// code reads the time before the render at request time.

const port = 4312;
const baseURL = `http://localhost:${port}`;
let server: ChildProcess;
let output = '';

test.beforeAll(async () => {
  server = spawn('pnpm', ['next', 'dev', '--port', String(port)], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  });
  server.stdout?.on('data', (chunk) => {
    output += chunk;
  });
  server.stderr?.on('data', (chunk) => {
    output += chunk;
  });
  await expect.poll(() => output, { timeout: 30_000 }).toMatch(/Ready in/);
});

test.afterAll(() => {
  server?.kill();
});

/** The output of the server for one request. */
async function outputOf(path: string, init?: RequestInit) {
  const start = output.length;
  const response = await fetch(`${baseURL}${path}`, init);
  const html = await response.text();
  // The validation of the stages ends after the response
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return { response, html, log: output.slice(start) };
}

test('a provider can read the time, without connection() in the application', async () => {
  const { response, html, log } = await outputOf('/', {
    headers: { cookie: 'user=alice' },
  });

  expect(response.status).toBe(200);
  expect(html).toContain('<p id="sale">true</p>');
  expect(log).not.toContain('Date.now()');
  expect(log).not.toMatch(/Error/);
});

test('a flag in "use cache" fails with the error of the SDK', async () => {
  const { html, log } = await outputOf('/cached');

  // Not the default value of the flag
  expect(html).not.toContain('<p id="sale">');
  expect(log).toContain(
    'flags: A flag can not be evaluated inside a cache scope',
  );
});
