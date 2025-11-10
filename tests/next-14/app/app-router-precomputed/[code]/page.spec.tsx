import { expect, test } from '@playwright/test';
import { port } from '../../../port';

test('displays the flag value', async ({ page }) => {
  await page.goto(`http://localhost:${port}/app-router-static`);
  await expect(
    page.getByText('Example App Router Flag Value: true'),
  ).toBeVisible();
});

test('can read request headers', async ({ page }) => {
  const res = await page.goto(`http://localhost:${port}/app-router-static`);
  await expect(page.getByText(`Host: localhost:${port}`)).toBeVisible();

  // ensure we were rewritten
  expect(res?.headers()['x-middleware-rewrite']).toBeDefined();
});

test('can read cookies', async ({ page }) => {
  await page.goto(`http://localhost:${port}/app-router-static`);
  await expect(page.getByText(`Cookie: example-cookie-value`)).toBeVisible();
});
