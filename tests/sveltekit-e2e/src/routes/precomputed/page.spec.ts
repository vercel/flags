import { test, expect } from '@playwright/test';
import { port } from '../../port';

test('displays the flag value (full page hit, new visitor)', async ({ page }) => {
	await page.goto(`http://localhost:${port}/precomputed`);
	await expect(page.getByText('visitorId|no cookie|visitorId')).toBeVisible();
});

test('displays the flag value (full page hit, known visitor)', async ({ page }) => {
	await page.context().addCookies([
		{
			name: 'visitorId',
			value: 'visitorId',
			url: `http://localhost:${port}/`
		}
	]);
	await page.goto(`http://localhost:${port}/precomputed`);
	await expect(page.getByText('visitorId|visitorId|no header')).toBeVisible();
});

test('displays the flag value (client-side navigation, new visitor)', async ({ page }) => {
	await page.goto(`http://localhost:${port}/`);
	await page.click('a[href="/precomputed"]');
	await expect(page.getByText('visitorId|no cookie|visitorId')).toBeVisible();
});

test('displays the flag value (client-side navigation, known visitor)', async ({ page }) => {
	await page.context().addCookies([
		{
			name: 'visitorId',
			value: 'visitorId',
			url: `http://localhost:${port}/`
		}
	]);
	await page.goto(`http://localhost:${port}/`);
	await page.click('a[href="/precomputed"]');
	await expect(page.getByText('visitorId|visitorId|no header')).toBeVisible();
});
