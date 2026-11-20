# Testing

Flags are async functions and providers are plain objects, so the usual tools work. The examples use Vitest. Jest and `node:test` work the same way.

| You want to                                   | Use                                                       |
| --------------------------------------------- | --------------------------------------------------------- |
| Test your code with fixed flag values         | [Mock the flags module](#mock-the-flags-module)            |
| Test flags and their rules without a network  | [An in-memory provider](#use-an-in-memory-provider)        |
| Test the evaluation context, e.g. cookies     | [Simulate a request](#simulate-a-request)                  |
| Test the running app in a browser             | [Override cookies](#end-to-end-tests-with-a-flags_secret)  |
| The same on Vercel without a shared secret    | [`signOverrides`](#end-to-end-tests-without-a-flags_secret) |

## Mock the flags module

Keep flags in their own module. Then a test replaces them:

```ts
// dashboard.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dashboardTitle } from './dashboard';
import { newDashboard } from './flags';

vi.mock('./flags', () => ({
  newDashboard: vi.fn(),
}));

describe('dashboardTitle', () => {
  beforeEach(() => {
    vi.mocked(newDashboard).mockReset();
  });

  it('shows the new dashboard when the flag is on', async () => {
    vi.mocked(newDashboard).mockResolvedValue(true);
    expect(await dashboardTitle()).toBe('New dashboard');
  });
});
```

The mock needs no provider, no request and no `FLAGS_SECRET`.

## Use an in-memory provider

```sh
pnpm add -D @openfeature/server-sdk
```

Mock the module of the source:

```ts
// flags.test.ts
import { expect, it, vi } from 'vitest';
import { newDashboard } from './flags';

vi.mock('./flags/self', async () => {
  const { TypedInMemoryProvider } = await import('@openfeature/server-sdk');
  const { defineSource } = await import('flags');
  return {
    self: defineSource({
      provider: new TypedInMemoryProvider({
        newDashboard: {
          variants: { on: true, off: false },
          defaultVariant: 'off',
          disabled: false,
          // On for alice only
          contextEvaluator: (context) => (context.user === 'alice' ? 'on' : 'off'),
        },
      } as const),
      getEvaluationContext: (request) => ({
        user: request?.cookies?.get('user')?.value ?? 'anonymous',
      }),
    }),
  };
});

it('evaluates the in-memory flag', async () => {
  expect(await newDashboard()).toBe(false); // no request: the user is "anonymous"
});
```

### With code generation

Mock `provider.ts` of the source, and keep `context.ts`:

```ts
// flags.test.ts
import { expect, it, vi } from 'vitest';
import { newDashboard } from 'flags:self';

vi.mock('./flags/sources/self/provider.ts', async () => {
  const { TypedInMemoryProvider } = await import('@openfeature/server-sdk');
  return {
    default: new TypedInMemoryProvider({
      newDashboard: {
        variants: { on: true, off: false },
        defaultVariant: 'on',
        disabled: false,
      },
    } as const),
  };
});

it('evaluates the in-memory flag', async () => {
  expect(await newDashboard()).toBe(true);
});
```

Unless the test runner uses the framework plugin, generate the modules first, and alias `flags:<source>`:

```ts
// vitest.config.ts
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [{ find: /^flags:(.+)$/, replacement: `${path.resolve('.flags')}/$1.ts` }],
  },
});
```

```json
{
  "scripts": {
    "test": "flags sync && vitest"
  }
}
```

Close the providers after the tests:

```ts
// test/setup.ts (in test.setupFiles)
import { runtime } from 'flags/runtime';
import { afterAll } from 'vitest';

afterAll(() => runtime.onShutdown());
```

Without the framework plugin, the configuration files are not loaded in tests. If the tests need the hooks or the settings, e.g. `overrides`, call `runtime.configure({ hooks, settings })` in the setup file, with the default export of `flags/hooks.ts` and the content of `flags/config.json`.

## Simulate a request

In a test, `request` is `undefined`. Run the code in `runtime.onInvoke` with a Web `Request`:

```ts
import { runtime } from 'flags/runtime';
import { expect, it } from 'vitest';
import { betaBanner } from './flags';

it('shows the beta banner with the beta cookie', async () => {
  const request = new Request('https://shop.example', {
    headers: { cookie: 'beta=1' },
  });

  expect(await runtime.onInvoke(request, () => betaBanner())).toBe(true);
});
```

- Inside `onInvoke`, each flag is evaluated once, as in a real request. Use a new `onInvoke` per simulated request.
- A flag that needs a context: `await teamInsights({ evaluationContext: { teamId: 'team-1' } })`.
- An override cookie works here too: a `Request` with `cookie: flag-overrides=<token>`, with `FLAGS_SECRET` set in the test process.

## End-to-end tests with a `FLAGS_SECRET`

The app and the test share `FLAGS_SECRET`. Generate a secret for local tests:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Use such a generated value only for local tests. Never print, log or commit the secret of a real environment.

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

// Only for tests. 32 random bytes as base64url.
export const FLAGS_SECRET = process.env.FLAGS_SECRET ?? 'dGhpcy1pcy1hLXRlc3Qtc2VjcmV0LWZvci1mbGFncyE';

export default defineConfig({
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    env: { FLAGS_SECRET },
  },
});
```

```ts
// e2e/checkout.spec.ts
import { expect, test } from '@playwright/test';
import { encryptOverrides } from 'flags/explorer';
import { FLAGS_SECRET } from '../playwright.config';

test('shows the express checkout', async ({ context, page, baseURL }) => {
  const token = await encryptOverrides({ checkout: 'express' }, FLAGS_SECRET);
  await context.addCookies([
    { name: 'flag-overrides', value: token, url: baseURL! },
  ]);

  await page.goto('/checkout');
  await expect(page.getByText('Express checkout')).toBeVisible();
});
```

- `encryptOverrides(overrides, secret?, expirationTime?)`: the default secret is `FLAGS_SECRET`, the default expiration one year.
- Use the flag `key` as the key of the overrides.
- An override must fit the type of the flag. Otherwise it is ignored with a warning.
- An override skips the provider, so the test does not depend on the rules of the flag management system.
- In Next.js, load the secret from the `.env` files with `loadEnvConfig(process.cwd(), true)` of `@next/env` at the top of `playwright.config.ts`. Overrides also work for precomputed pages, when the cookie is set before the proxy runs.

## End-to-end tests without a `FLAGS_SECRET`

On Vercel, and locally after `vercel env pull`, the SDK accepts tokens that Vercel signs. `signOverrides` asks Vercel for one. It uses the OIDC token of the host, so the token is valid only for that project and environment. Let the app sign, in a route that only tests can reach:

```ts
// app/api/internal/flag-overrides/route.ts
import { signOverrides } from 'flags/explorer';

export async function POST(request: Request) {
  // Off by default. Turn it on only for the environments you test against.
  if (process.env.FLAG_OVERRIDES_ROUTE !== 'enabled') {
    return new Response(null, { status: 404 });
  }
  const overrides = await request.json();
  return Response.json({ token: await signOverrides(overrides) });
}
```

```ts
// e2e/checkout.spec.ts
import { expect, test } from '@playwright/test';

test('shows the express checkout', async ({ context, page, request, baseURL }) => {
  const response = await request.post('/api/internal/flag-overrides', {
    data: { checkout: 'express' },
  });
  const { token } = await response.json();
  await context.addCookies([
    { name: 'flag-overrides', value: token, url: baseURL! },
  ]);

  await page.goto('/checkout');
  await expect(page.getByText('Express checkout')).toBeVisible();
});
```

- Whoever reaches the route can override the flags of the deployment. Turn it on only for Preview and Development, and protect the deployment with Deployment Protection.
- Vercel limits how often a team can sign. Request one token per set of overrides, and reuse it for the run.
- A token expires after one hour by default. For longer runs, pass a `ttl` of up to one day in seconds: `signOverrides(overrides, { ttl: 4 * 60 * 60 })`.

## `vercel flags override`

`vercel flags override <key>=<value>` creates a token encrypted with `FLAGS_SECRET` (from the environment or `.env.local`) for the v4 cookie `vercel-flag-overrides`, which v5 still reads. Use the secret of the environment you test against. Do not print the token.

## Type tests

```ts
// flags.test-d.ts
import { expectTypeOf, it } from 'vitest';
import { checkout } from './flags';

it('has the options as its value type', () => {
  expectTypeOf(checkout).returns.resolves.toEqualTypeOf<
    'control' | 'express' | (string & {})
  >();
});
```
