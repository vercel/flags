import { test, expect } from '@playwright/test';
import { port } from '../port';

test('displays the flag value', async ({ page }) => {
	await page.goto(`http://localhost:${port}/`);
	await expect(page.getByText('Dashboard Flag Value: true')).toBeVisible();
});

test('can read request headers', async ({ page }) => {
	await page.goto(`http://localhost:${port}/`);
	await expect(page.getByText(`Host: localhost:${port}`)).toBeVisible();
});

test('can read cookies', async ({ page }) => {
	await page.context().addCookies([
		{
			name: 'example-cookie',
			value: 'example-cookie-value',
			url: `http://localhost:${port}/`
		}
	]);
	await page.goto(`http://localhost:${port}/`);
	await expect(page.getByText(`Cookie: example-cookie-value`)).toBeVisible();
});
