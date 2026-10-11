import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { encryptOverrides } from 'flags';
import { FLAGS_SECRET } from '../playwright.config';

// The app: withFlags loads flags.config.ts, and the flags use its default
// connection, with the user from a cookie of the request

test('evaluates the flags in a server component', async ({ request }) => {
  const html = await (await request.get('/')).text();

  expect(html).toContain(
    '{&quot;sale&quot;:true,&quot;checkout&quot;:false,&quot;banner&quot;:&quot;Summer sale!&quot;}',
  );
});

test('gives the cookies of the request to the evaluation context', async ({
  request,
}) => {
  const response = await request.get('/api/flags', {
    headers: { cookie: 'user=alice' },
  });

  expect(await response.json()).toMatchObject({ checkout: true });
});

test('evaluates a flag again in a nested server component', async ({
  request,
}) => {
  const html = await (
    await request.get('/', { headers: { cookie: 'user=alice' } })
  ).text();

  expect(html).toContain('<p id="checkout">true</p>');
});

test('creates the evaluation context one time for each request', async ({
  request,
}) => {
  const response = await request.get('/api/flags', {
    headers: { 'x-request-id': 'request-1' },
  });

  // Five evaluations, but one call of getEvaluationContext: Next.js gives
  // the same headers object during one request
  expect(await response.json()).toMatchObject({ contextCalls: 1 });
});

test('evaluates each flag one time for each request', async ({ request }) => {
  const response = await request.get('/api/flags', {
    headers: { 'x-request-id': 'request-2' },
  });

  // Five calls of three flags: the hook sees three evaluations
  expect(await response.json()).toMatchObject({ evaluations: 3 });
});

test('keeps requests apart', async ({ request }) => {
  const [alice, bob] = await Promise.all([
    request.get('/api/flags', { headers: { cookie: 'user=alice' } }),
    request.get('/api/flags', { headers: { cookie: 'user=bob' } }),
  ]);

  expect(await alice.json()).toMatchObject({ checkout: true });
  expect(await bob.json()).toMatchObject({ checkout: false });
});

test('applies an override cookie', async ({ request }) => {
  const token = await encryptOverrides(
    { 'summer-sale': false, 'banner-text': 'Override' },
    FLAGS_SECRET,
  );
  const response = await request.get('/api/flags', {
    headers: { cookie: `flag-overrides=${token}` },
  });

  expect(await response.json()).toMatchObject({
    sale: false,
    banner: 'Override',
  });
});

test('evaluates a static page at build time without a request', async ({
  request,
}) => {
  const html = await (
    await request.get('/static', { headers: { cookie: 'user=alice' } })
  ).text();

  // Built before any request, so the user is "anonymous", also for alice
  expect(html).toContain('<p id="static-checkout">false</p>');
});

test('precomputes the flags in the proxy for a static page', async ({
  request,
}) => {
  const [anonymous, alice] = await Promise.all([
    request.get('/precomputed'),
    request.get('/precomputed', { headers: { cookie: 'user=alice' } }),
  ]);

  // The page exists only for the codes of generateStaticParams
  expect(await anonymous.text()).toContain(
    '{&quot;sale&quot;:true,&quot;checkout&quot;:false}',
  );
  expect(await alice.text()).toContain(
    '{&quot;sale&quot;:true,&quot;checkout&quot;:true}',
  );
});

test('applies an override cookie to precomputed flags', async ({ request }) => {
  const token = await encryptOverrides({ 'summer-sale': false }, FLAGS_SECRET);
  const response = await request.get('/precomputed', {
    headers: { cookie: `flag-overrides=${token}` },
  });

  expect(await response.text()).toContain(
    '{&quot;sale&quot;:false,&quot;checkout&quot;:false}',
  );
});

test('has no page for a code which is not valid', async ({ request }) => {
  const response = await request.get('/precomputed/not-a-code');

  expect(response.status()).toBe(404);
});

test('registers the flags of a use flags module', async ({ request }) => {
  const response = await request.get('/api/registered');

  expect(await response.json()).toMatchObject({
    providers: expect.arrayContaining(['lazy']),
  });
});

test('has no public manifest route in production', async ({ request }) => {
  const response = await request.get('/.well-known/flags/manifest.json');

  expect(response.status()).toBe(404);
});

test('writes the manifest of the flags into the build', () => {
  const distDir =
    test.info().project.name === 'app-webpack' ? '.next-webpack' : '.next';
  const manifest = JSON.parse(
    readFileSync(join(distDir, 'flags-manifest.json'), 'utf8'),
  );

  expect(manifest).toEqual({
    version: 1,
    definitions: {
      'banner-text': {
        type: 'string',
        defaultValue: 'Welcome',
        description: 'The text of the banner',
        declaredInCode: true,
        sources: [{ module: 'flags.ts', export: 'bannerText' }],
      },
      'new-checkout': {
        type: 'boolean',
        declaredInCode: true,
        sources: [{ module: 'flags.ts', export: 'newCheckout' }],
      },
      'plain-flag': {
        type: 'boolean',
        declaredInCode: true,
        sources: [{ module: 'lazy-flags.ts', export: 'plainFlag' }],
      },
      'summer-sale': {
        type: 'boolean',
        declaredInCode: true,
        sources: [{ module: 'flags.ts', export: 'summerSale' }],
      },
    },
  });
});
