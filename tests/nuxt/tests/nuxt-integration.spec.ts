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
    await page.waitForSelector('[data-testid="api-response"]');

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
        domain: '127.0.0.1',
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

  test('flags from flags directory are auto-imported', async ({
    page,
    goto,
  }) => {
    await goto('/basic', { waitUntil: 'hydration' });

    // These flags come from flags/index.ts
    await expect(page.getByTestId('example-flag')).toBeVisible();
    await expect(page.getByTestId('feature-toggle')).toBeVisible();
  });
});

test.describe('Precompute Support', () => {
  test('handlePrecomputedPaths middleware processes requests', async ({
    page,
    goto,
  }) => {
    await goto('/precompute', { waitUntil: 'hydration' });

    // Verify flags are evaluated
    await expect(page.getByTestId('example-flag')).toHaveText(
      'Example Flag: true',
    );
    await expect(page.getByTestId('feature-toggle')).toHaveText(
      'Feature Toggle: false',
    );
  });

  test('precompute generates valid hashes', async ({ page, goto }) => {
    await goto('/precompute', { waitUntil: 'hydration' });

    // After middleware processing, we should be on either the original URL
    // or a hash-prefixed URL if redirected
    const url = page.url();

    // URL should contain /precompute
    expect(url).toContain('/precompute');

    // Flags should still evaluate correctly
    await expect(page.getByTestId('example-flag')).toBeVisible();
    await expect(page.getByTestId('feature-toggle')).toBeVisible();
  });

  test('precomputed routes maintain flag values', async ({
    page,
    goto,
    context,
  }) => {
    // Set a cookie that might affect flag evaluation
    await context.addCookies([
      {
        name: 'example-cookie',
        value: 'precompute-test',
        domain: '127.0.0.1',
        path: '/',
      },
    ]);

    await goto('/precompute', { waitUntil: 'hydration' });

    // Get flag values
    const exampleText = await page.getByTestId('example-flag').textContent();
    const toggleText = await page.getByTestId('feature-toggle').textContent();

    // Verify consistency
    expect(exampleText).toBe('Example Flag: true');
    expect(toggleText).toBe('Feature Toggle: false');
  });

  test('hash is stripped from URL for Vue app', async ({ page, goto }) => {
    await goto('/precompute', { waitUntil: 'hydration' });

    // Check that the page renders correctly without hash in the visible URL
    // (the middleware should strip it before Vue processes it)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Precompute Test',
    );

    // Navigation should work normally
    await page.click('a[href="/"]');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Nuxt Flags Test Suite',
    );
  });

  test('precompute works with SSR', async ({ page, goto }) => {
    const response = await goto('/precompute', {
      waitUntil: 'domcontentloaded',
    });
    const html = await response?.text();

    // Verify flag values are present in SSR HTML
    expect(html).toContain('Example Flag: true');
    expect(html).toContain('Feature Toggle: false');
  });

  test('multiple visits to precomputed route are consistent', async ({
    page,
    goto,
  }) => {
    // Visit once
    await goto('/precompute', { waitUntil: 'hydration' });
    const firstExample = await page.getByTestId('example-flag').textContent();
    const firstToggle = await page.getByTestId('feature-toggle').textContent();

    // Navigate away
    await page.click('a[href="/"]');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Nuxt Flags Test Suite',
    );

    // Visit again
    await page.click('a[href="/precompute"]');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Precompute Test',
    );

    const secondExample = await page.getByTestId('example-flag').textContent();
    const secondToggle = await page.getByTestId('feature-toggle').textContent();

    // Values should be consistent
    expect(firstExample).toBe(secondExample);
    expect(firstToggle).toBe(secondToggle);
  });
});
