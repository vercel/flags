import { readFileSync } from 'node:fs';
import { expect, test } from '@nuxt/test-utils/playwright';
import { encryptOverrides } from 'flags';

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

  test('flags can be overridden with encrypted cookie', async ({
    page,
    goto,
    context,
  }) => {
    const encryptedOverrides = await encryptOverrides(
      // normally true
      { 'example-flag': false },
      getSecret(),
    );

    await context.addCookies([
      {
        name: 'vercel-flag-overrides',
        value: encryptedOverrides,
        domain: '127.0.0.1',
        path: '/',
      },
    ]);

    await goto('/basic', { waitUntil: 'hydration' });

    // The flag should now be false instead of true
    await expect(page.getByTestId('example-flag')).toHaveText(
      'Example Flag: false',
    );
  });

  test('flags ignore overrides with wrong secret', async ({
    page,
    goto,
    context,
  }) => {
    const wrongSecret = getSecret().replace(/.{8}/, 'invalid-');

    // Try to override with wrong secret
    const encryptedOverrides = await encryptOverrides(
      { 'example-flag': false },
      wrongSecret,
    );

    await context.addCookies([
      {
        name: 'vercel-flag-overrides',
        value: encryptedOverrides,
        domain: '127.0.0.1',
        path: '/',
      },
    ]);

    await goto('/basic', { waitUntil: 'hydration' });

    // The flag should keep its original value (true) since the secret is wrong
    await expect(page.getByTestId('example-flag')).toHaveText(
      'Example Flag: true',
    );
  });

  test('multiple flags can be overridden at once', async ({
    page,
    goto,
    context,
  }) => {
    // Override multiple flags
    const encryptedOverrides = await encryptOverrides(
      {
        'example-flag': false,
        'feature-toggle': true,
      },
      getSecret(),
    );

    await context.addCookies([
      {
        name: 'vercel-flag-overrides',
        value: encryptedOverrides,
        domain: '127.0.0.1',
        path: '/',
      },
    ]);

    await goto('/basic', { waitUntil: 'hydration' });

    // Both flags should be overridden
    await expect(page.getByTestId('example-flag')).toHaveText(
      'Example Flag: false',
    );
    await expect(page.getByTestId('feature-toggle')).toHaveText(
      'Feature Toggle: true',
    );
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
    await expect(page.getByTestId('cookie-flag')).toHaveText(
      'Cookie: no cookie',
    );
    await expect(page.getByTestId('user-role-flag')).toHaveText(
      'User Role: guest',
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
    await expect(page.getByTestId('cookie-flag')).toBeVisible();
    await expect(page.getByTestId('user-role-flag')).toBeVisible();
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
      {
        name: 'user-role',
        value: 'user',
        domain: '127.0.0.1',
        path: '/',
      },
    ]);

    await goto('/precompute', { waitUntil: 'hydration' });

    // Get flag values
    const exampleText = await page.getByTestId('example-flag').textContent();
    const cookieText = await page.getByTestId('cookie-flag').textContent();
    const roleText = await page.getByTestId('user-role-flag').textContent();

    // Verify consistency
    expect(exampleText).toBe('Example Flag: true');
    expect(cookieText).toBe('Cookie: precompute-test');
    expect(roleText).toBe('User Role: user');
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
    expect(html).toContain('Cookie: no cookie');
    expect(html).toContain('User Role: guest');

    // Precompute hash should be present
    await expect(page.getByTestId('precompute-hash')).toBeVisible();
    const hashText = await page.getByTestId('precompute-hash').textContent();
    expect(hashText).toMatch(
      /^Hash: [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
  });

  test('multiple visits to precomputed route are consistent', async ({
    page,
    goto,
  }) => {
    // Visit once
    await goto('/precompute', { waitUntil: 'hydration' });
    const firstExample = await page.getByTestId('example-flag').textContent();
    const firstCookie = await page.getByTestId('cookie-flag').textContent();
    const firstRole = await page.getByTestId('user-role-flag').textContent();

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
    const secondCookie = await page.getByTestId('cookie-flag').textContent();
    const secondRole = await page.getByTestId('user-role-flag').textContent();

    // Values should be consistent
    expect(firstExample).toBe(secondExample);
    expect(firstCookie).toBe(secondCookie);
    expect(firstRole).toBe(secondRole);

    // Precompute hash should be present
    await expect(page.getByTestId('precompute-hash')).toBeVisible();
    const hashText = await page.getByTestId('precompute-hash').textContent();
    expect(hashText).toMatch(
      /^Hash: [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
  });

  test('client-side navigation to precomputed page shows correct flag values', async ({
    page,
    goto,
    context,
  }) => {
    // Set cookies that affect flag evaluation
    await context.addCookies([
      {
        name: 'example-cookie',
        value: 'nav-test-value',
        domain: '127.0.0.1',
        path: '/',
      },
      {
        name: 'user-role',
        value: 'admin',
        domain: '127.0.0.1',
        path: '/',
      },
    ]);

    // Start from home page
    await goto('/', { waitUntil: 'hydration' });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Nuxt Flags Test Suite',
    );

    // Navigate to precomputed page using client-side navigation
    await page.click('a[href="/precompute"]');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Precompute Test',
    );

    // Static flag should have correct value
    await expect(page.getByTestId('example-flag')).toBeVisible();
    await expect(page.getByTestId('example-flag')).toHaveText(
      'Example Flag: true',
    );

    // Cookie-based flags should reflect the cookies we set
    await expect(page.getByTestId('cookie-flag')).toBeVisible();
    await expect(page.getByTestId('cookie-flag')).toHaveText(
      'Cookie: nav-test-value',
    );
    await expect(page.getByTestId('user-role-flag')).toBeVisible();
    await expect(page.getByTestId('user-role-flag')).toHaveText(
      'User Role: admin',
    );

    // Precompute hash should be present
    await expect(page.getByTestId('precompute-hash')).toBeVisible();
    const hashText = await page.getByTestId('precompute-hash').textContent();
    expect(hashText).toMatch(
      /^Hash: [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
  });

  test('flags can be overridden on precomputed pages', async ({
    page,
    goto,
    context,
  }) => {
    // Override exampleFlag to false (normally true) and user-role to 'admin' (normally 'guest')
    const encryptedOverrides = await encryptOverrides(
      {
        'example-flag': false,
        'user-role': 'admin',
      },
      getSecret(),
    );

    await context.addCookies([
      {
        name: 'vercel-flag-overrides',
        value: encryptedOverrides,
        domain: '127.0.0.1',
        path: '/',
      },
    ]);

    await goto('/precompute', { waitUntil: 'hydration' });

    // Overridden flags should show their override values
    await expect(page.getByTestId('example-flag')).toHaveText(
      'Example Flag: false',
    );
    await expect(page.getByTestId('user-role-flag')).toHaveText(
      'User Role: admin',
    );

    // Non-overridden flags should still work normally
    await expect(page.getByTestId('cookie-flag')).toHaveText(
      'Cookie: no cookie',
    );
  });
});

function getSecret() {
  if (process.env.FLAGS_SECRET) {
    return process.env.FLAGS_SECRET;
  }
  const secret = readFileSync(new URL('../.env', import.meta.url), 'utf-8')
    .match(/FLAGS_SECRET=(.+)/)?.[1]
    .trim();
  if (!secret) {
    throw new Error('FLAGS_SECRET not found in .env file');
  }
  return secret;
}
