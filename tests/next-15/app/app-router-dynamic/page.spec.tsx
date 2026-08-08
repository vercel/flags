import { expect, test } from '@playwright/test';
import { port } from '../../port';

/**
 * `requestScopedFlag` ignores headers and cookies and returns a new value on
 * every evaluation, so this page can only produce a fresh value per request if
 * the SDK opted it out of static generation. That is the counterpart to the
 * "keeps page static" assertion for precomputed pages: reading the request
 * inside the SDK has the same effect as `await connection()`, so users do not
 * need to call it themselves.
 */
test('evaluates flags per request without an explicit connection()', async ({
  page,
}) => {
  await page.goto(`http://localhost:${port}/app-router-dynamic`);
  const first = await page
    .getByTestId('request-scoped-flag')
    .textContent({ timeout: 10_000 });

  await page.goto(`http://localhost:${port}/app-router-dynamic?cache-bust=1`);
  const second = await page
    .getByTestId('request-scoped-flag')
    .textContent({ timeout: 10_000 });

  expect(first).toMatch(/^Request scoped: .+/);
  expect(second).not.toBe(first);
});
