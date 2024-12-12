import { test, expect } from '@playwright/test';
import { port } from '../../../port';

test('displays the flag value', async ({ page }) => {
  await page.goto(`http://localhost:${port}/pages-router-static`);
  await expect(
    page.getByText('Pages Router Precomputed Example: true'),
  ).toBeVisible();
});

test('can read request headers', async ({ page }) => {
  await page.goto(`http://localhost:${port}/pages-router-static`);
  await expect(
    page.getByText(`Pages Router Precomputed Host: localhost:${port}`),
  ).toBeVisible();
});

test('can read cookies', async ({ page }) => {
  await page.goto(`http://localhost:${port}/pages-router-static`);
  await expect(
    page.getByText(`Pages Router Precomputed Cookie: example-cookie-value`),
  ).toBeVisible();
});
