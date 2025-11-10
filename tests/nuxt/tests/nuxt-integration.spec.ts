import { expect, test } from '@nuxt/test-utils/playwright';

test.describe('Nuxt Integration', () => {
  test('flags are auto-imported and work in pages', async ({ page, goto }) => {
    await goto('/basic', { waitUntil: 'hydration' });

    // Verify flags defined with defineFlag are evaluated with correct values
    await expect(page.getByTestId('example-flag')).toHaveText(
      'Example Flag: true',
    );
    await expect(page.getByTestId('feature-toggle')).toHaveText(
      'Feature Toggle: false',
    );
  });

  test('flags can read request headers', async ({ page, goto }) => {
    await goto('/headers-and-cookies', { waitUntil: 'hydration' });

    // Host header should be read from the request
    const hostText = await page.getByTestId('host-flag').textContent();
    // Host can be either localhost or 127.0.0.1
    expect(hostText).toMatch(/Host: (localhost|127\.0\.0\.1):\d+/);
  });

  test('flags can read cookies from request', async ({
    page,
    goto,
    context,
  }) => {
    await context.addCookies([
      {
        name: 'example-cookie',
        value: 'test-value',
        domain: '127.0.0.1',
        path: '/',
      },
    ]);

    await goto('/headers-and-cookies', { waitUntil: 'hydration' });

    // Cookie value should be read from the request
    await expect(page.getByTestId('cookie-flag')).toHaveText(
      'Cookie: test-value',
    );
  });

  test('flags handle missing cookies gracefully', async ({ page, goto }) => {
    await goto('/headers-and-cookies', { waitUntil: 'hydration' });

    // Without setting a cookie, should show default value
    await expect(page.getByTestId('cookie-flag')).toHaveText(
      'Cookie: no cookie',
    );
  });

  test('flags are evaluated during SSR', async ({ page, goto }) => {
    const response = await goto('/basic', { waitUntil: 'domcontentloaded' });
    const html = await response?.text();

    // Verify flag values are present in SSR HTML before hydration
    expect(html).toContain('Example Flag: true');
    expect(html).toContain('Feature Toggle: false');
  });

  test('flag values are consistent between SSR and hydration', async ({
    page,
    goto,
  }) => {
    const response = await goto('/basic', { waitUntil: 'domcontentloaded' });
    const htmlBefore = await response?.text();

    // SSR should render flag values
    expect(htmlBefore).toContain('Example Flag: true');
    expect(htmlBefore).toContain('Feature Toggle: false');

    // After hydration, values should match SSR
    await expect(page.getByTestId('example-flag')).toHaveText(
      'Example Flag: true',
    );
    await expect(page.getByTestId('feature-toggle')).toHaveText(
      'Feature Toggle: false',
    );
  });

  test('flags work in server API routes', async ({ page, goto }) => {
    await goto('/api-test', { waitUntil: 'hydration' });

    await page.click('[data-testid="fetch-button"]');
    await page.waitForTimeout(500);

    const responseText = await page.getByTestId('api-response').textContent();
    expect(responseText).toContain('exampleFlag');
    expect(responseText).toContain('true');
  });

  test('flags in API routes respect cookies', async ({
    page,
    goto,
    context,
  }) => {
    await context.addCookies([
      {
        name: 'user-role',
        value: 'admin',
        domain: '127.0.0.1',
        path: '/',
      },
    ]);

    await goto('/api-test', { waitUntil: 'hydration' });
    await page.click('[data-testid="fetch-button"]');
    await page.waitForSelector('[data-testid="api-response"]');

    const responseText = await page.getByTestId('api-response').textContent();
    expect(responseText).toContain('userRole');
    expect(responseText).toContain('admin');
  });

  test('flags work during client-side navigation', async ({ page, goto }) => {
    await goto('/', { waitUntil: 'hydration' });

    // Navigate client-side
    await page.click('a[href="/basic"]');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Basic Flags',
    );

    // Flags should have correct values after client-side navigation
    await expect(page.getByTestId('example-flag')).toHaveText(
      'Example Flag: true',
    );
    await expect(page.getByTestId('feature-toggle')).toHaveText(
      'Feature Toggle: false',
    );

    // Navigate back
    await page.click('a[href="/"]');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Nuxt Flags Test Suite',
    );
  });

  test('flag values remain consistent across navigation', async ({
    page,
    goto,
    context,
  }) => {
    await context.addCookies([
      {
        name: 'example-cookie',
        value: 'persistent-value',
        domain: 'localhost',
        path: '/',
      },
    ]);

    await goto('/headers-and-cookies', { waitUntil: 'hydration' });

    // Check that flag is visible
    await expect(page.getByTestId('cookie-flag')).toBeVisible();
    const firstValue = await page.getByTestId('cookie-flag').textContent();

    // Navigate away and back
    await page.click('a[href="/"]');
    await page.click('a[href="/headers-and-cookies"]');

    const secondValue = await page.getByTestId('cookie-flag').textContent();
    expect(firstValue).toBe(secondValue);
  });

  test('flags from shared/flags directory are auto-imported', async ({
    page,
    goto,
  }) => {
    // Tests that the flags: { dir: './shared/flags' } config works
    await goto('/basic', { waitUntil: 'hydration' });

    // These flags come from shared/flags/index.ts
    await expect(page.getByTestId('example-flag')).toBeVisible();
    await expect(page.getByTestId('feature-toggle')).toBeVisible();
  });
});
