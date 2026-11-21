/**
 * A walkthrough of the features of the SDK. Each group shows one feature as
 * an application would use it. The tests show that the features work and how
 * the API feels. They do not test each detail: the other test files do that.
 *
 * Keep this file up to date when you add a feature.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptOverrides, encryptOverrides } from './explorer';
import { compileFlagsFile } from './flags-file/compile';
import { parseFlagsFile } from './flags-file/document';
import { generateFlags } from './generate';
import {
  defineFlag,
  defineSource,
  evaluate,
  FlagEvaluationError,
  type Hook,
  OVERRIDE_REASON,
  type Provider,
  track,
} from './index';
import { createManifest, resolveFlagLinks } from './manifest';
// Only to sign tokens like the Vercel Toolbar: the issuer which the SDK trusts
import { VERCEL_TOOLBAR_ISSUER } from './overrides/vercel';
import {
  type Config,
  registerFlags,
  registerSources,
  runtime,
} from './runtime-module';

// A provider with some flags. In an application, this is the OpenFeature
// provider of a platform, e.g. LaunchDarkly.
function createProvider() {
  return new TypedInMemoryProvider({
    'summer-sale': {
      variants: { on: true, off: false },
      defaultVariant: 'on',
      disabled: false,
    },
    'new-checkout': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      // On for alice only
      contextEvaluator: (context) => (context.user === 'alice' ? 'on' : 'off'),
    },
    'team-insights': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      // On for enterprise teams only
      contextEvaluator: (context) =>
        (context.team as { plan?: string } | undefined)?.plan === 'enterprise'
          ? 'on'
          : 'off',
    },
  } as const);
}

// A provider which loads its data in initialize, e.g. from a CDN, and
// writes each lifecycle step to a list
function lifecycleSource(name = 'remote') {
  const steps: string[] = [];
  const flags = createProvider();
  const provider: Provider = {
    metadata: { name },
    async initialize() {
      steps.push(`${name}: initialize`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    },
    async onClose() {
      steps.push(`${name}: close`);
    },
    resolveBooleanEvaluation: (key, defaultValue, context, logger) => {
      steps.push(`${name}: evaluate ${key}`);
      return flags.resolveBooleanEvaluation(key, defaultValue, context, logger);
    },
  };
  const source = defineSource({
    provider,
    project: { system: 'in-memory' },
  });
  return { source, steps };
}

let errors: string[];

beforeEach(() => {
  runtime.reset();
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((message) => {
    errors.push(String(message));
  });
});

afterEach(() => {
  runtime.setGetRequest(undefined);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('1. Sources and flags', () => {
  it('defines a flag and evaluates it', async () => {
    // A source links flags to a flag project in a flag management
    // system (system), and to the
    // provider which evaluates them
    const launchdarkly = defineSource({
      provider: createProvider(),
      project: { system: 'launchdarkly', projectId: 'shop', teamId: 'acme' },
    });

    const summerSale = launchdarkly.bindFlag('summer-sale');

    expect(await summerSale()).toBe(true);
  });

  it('gives each flag access to its project', () => {
    const launchdarkly = defineSource({
      provider: createProvider(),
      project: { system: 'launchdarkly', projectId: 'shop', teamId: 'acme' },
    });
    const summerSale = launchdarkly.bindFlag('summer-sale');

    expect(summerSale.key).toBe('summer-sale');
    expect(summerSale.source.project).toEqual({
      system: 'launchdarkly',
      projectId: 'shop',
      teamId: 'acme',
    });
  });

  it('defines an inline flag, which decides its value in the code', async () => {
    // No provider: decide receives the context of the call side and the
    // request. Overrides, hooks and the cache of the request still apply.
    const betaBanner = defineFlag({
      key: 'beta-banner',
      decide: (request) => request?.cookies?.get('beta')?.value === '1',
      options: [false, true] as const, // optional, e.g. for Flags Explorer
    });

    const request = new Request('https://shop.example', {
      headers: { cookie: 'beta=1' },
    });
    expect(await runtime.onInvoke(request, () => betaBanner())).toBe(true);
    expect(await betaBanner()).toBe(false);
  });

  it('requires the fields of the system', () => {
    void (() => {
      defineSource({
        provider: createProvider(),
        // @ts-expect-error launchdarkly requires projectId
        project: { system: 'launchdarkly' },
      });
      // in-memory requires no fields
      defineSource({
        provider: createProvider(),
        project: { system: 'in-memory' },
      });
    });
  });
});

describe('2. Default values and errors', () => {
  const source = () =>
    defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
    });

  it('returns the default value and logs one line when a flag fails', async () => {
    const missing = source().bindFlag('does-not-exist', {
      defaultValue: false,
    });

    expect(await missing()).toBe(false);
    expect(errors).toEqual([
      'flags: Could not evaluate flag "does-not-exist": no flag found with key does-not-exist. Returned the default value: false.',
    ]);
  });

  it('throws when a flag without a default value fails', async () => {
    const missing = source().bindFlag('does-not-exist');

    const error = await missing().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FlagEvaluationError);
    expect(error).toMatchObject({
      flagKey: 'does-not-exist',
      code: 'FLAG_NOT_FOUND',
    });
  });
});

describe('3. Several flags at once', () => {
  it('evaluates a list of flags and returns the values in order', async () => {
    const source = defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
    });
    const summerSale = source.bindFlag('summer-sale');
    const newCheckout = source.bindFlag('new-checkout');

    const [sale, checkout] = await evaluate([summerSale, newCheckout]);

    expect(sale).toBe(true);
    expect(checkout).toBe(false);
  });

  it('evaluates a key which is only known at runtime', async () => {
    const source = defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
    });
    const key = ['summer', 'sale'].join('-');

    expect(await evaluate({ key, source })).toBe(true);
  });
});

describe('4. The evaluation context chain', () => {
  // The context flows from the call side, through the flag, to the
  // source. Each step can change it.

  it('passes the context of the call side to the source', async () => {
    const source = defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
      // The source decides what its flags must give
      getEvaluationContext: (_request, context: { user: string }) => ({
        user: context.user,
      }),
    });
    const newCheckout = source.bindFlag('new-checkout');

    expect(await newCheckout({ evaluationContext: { user: 'alice' } })).toBe(
      true,
    );
    expect(await newCheckout({ evaluationContext: { user: 'bob' } })).toBe(
      false,
    );
  });

  it('lets an API route give the team which it knows from its path', async () => {
    const teams = {
      'team-1': { plan: 'enterprise' },
      'team-2': { plan: 'free' },
    };

    const source = defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
      // The source loads the team, e.g. from a database
      getEvaluationContext: async (
        _request,
        context: {
          teamId: keyof typeof teams;
        },
      ) => ({
        team: teams[context.teamId],
      }),
    });
    const teamInsights = source.bindFlag('team-insights');

    // e.g. GET /api/teams/team-1/insights
    expect(
      await teamInsights({ evaluationContext: { teamId: 'team-1' } }),
    ).toBe(true);
    expect(
      await teamInsights({ evaluationContext: { teamId: 'team-2' } }),
    ).toBe(false);
  });

  it('lets a flag convert the context between the call side and the source', async () => {
    const source = defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
      getEvaluationContext: (_request, context: { teamId: string }) => ({
        team: { plan: context.teamId === 'id-of-acme' ? 'enterprise' : 'free' },
      }),
    });

    // The call side knows the slug, the source needs the id
    const teamInsights = source.bindFlag('team-insights', {
      getEvaluationContext: (_request, context: { slug: string }) => ({
        teamId: `id-of-${context.slug}`,
      }),
    });

    expect(await teamInsights({ evaluationContext: { slug: 'acme' } })).toBe(
      true,
    );
  });

  it('checks the context at the type level', () => {
    const source = defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
      getEvaluationContext: (_request, context: { teamId: string }) => ({
        team: context.teamId,
      }),
    });
    const teamInsights = source.bindFlag('team-insights');

    void (() => {
      teamInsights({ evaluationContext: { teamId: 'team-1' } });
      // @ts-expect-error the source needs a teamId
      teamInsights();
      // @ts-expect-error teamId must be a string
      teamInsights({ evaluationContext: { teamId: 1 } });
    });
  });
});

describe('5. Requests', () => {
  // The source reads the user from a cookie of the current request
  function cookieSource() {
    const calls = { count: 0 };
    const source = defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
      getEvaluationContext: (request) => {
        calls.count++;
        return { user: request?.cookies?.get('user')?.value ?? 'anonymous' };
      },
    });
    return { source, calls };
  }

  it('gives each step the request of a middleware', async () => {
    const { source } = cookieSource();
    const newCheckout = source.bindFlag('new-checkout');

    // e.g. in Hono: app.use((c, next) => runtime.onInvoke(c.req.raw, next))
    const request = new Request('https://shop.example/checkout', {
      headers: { cookie: 'user=alice' },
    });
    const result = await runtime.onInvoke(request, () => newCheckout());

    expect(result).toBe(true);
  });

  it('gives each step the standard request: headers, cookies and URL', async () => {
    let seen: unknown;
    const source = defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
      getEvaluationContext: (request) => {
        seen = {
          header: request?.headers?.get('accept-language'),
          cookie: request?.cookies?.get('user')?.value,
          path: request?.url?.pathname,
        };
        return {};
      },
    });
    const summerSale = source.bindFlag('summer-sale');

    const request = new Request('https://shop.example/teams/acme', {
      headers: { 'accept-language': 'de-CH', cookie: 'user=alice' },
    });
    await runtime.onInvoke(request, () => summerSale());

    expect(seen).toEqual({
      header: 'de-CH',
      cookie: 'alice',
      path: '/teams/acme',
    });
  });

  it('creates the context once per request', async () => {
    const { source, calls } = cookieSource();
    const summerSale = source.bindFlag('summer-sale');
    const newCheckout = source.bindFlag('new-checkout');

    const request = new Request('https://shop.example', {
      headers: { cookie: 'user=alice' },
    });
    await runtime.onInvoke(request, async () => {
      await summerSale();
      await newCheckout();
      await evaluate([summerSale, newCheckout]);
    });

    expect(calls.count).toBe(1);
  });

  it('evaluates each flag once per request, so the page is consistent', async () => {
    const provider = createProvider();
    const resolve = vi.spyOn(provider, 'resolveBooleanEvaluation');
    const summerSale = defineSource({
      provider,
      project: { system: 'in-memory' },
    }).bindFlag('summer-sale');

    // e.g. a header and a footer which both use the flag
    await runtime.onInvoke(new Request('https://shop.example'), async () => {
      await summerSale();
      await summerSale();
    });
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('works like Next.js, which gives only headers() and cookies()', async () => {
    const { source, calls } = cookieSource();
    const newCheckout = source.bindFlag('new-checkout');

    // Next.js: headers() returns the same object during one request, so the
    // SDK can identify the request without a middleware
    const headers = new Headers({ cookie: 'user=alice' });
    runtime.setGetRequest(async () => ({ headers }));

    expect(await newCheckout()).toBe(true);
    expect(await newCheckout()).toBe(true);
    expect(calls.count).toBe(1);
  });

  it('uses no request outside of a request, e.g. in a script', async () => {
    const { source } = cookieSource();
    const newCheckout = source.bindFlag('new-checkout');

    expect(await newCheckout()).toBe(false); // user is "anonymous"
  });
});

describe('6. Runtime lifecycle', () => {
  it('initializes the providers before the first request', async () => {
    const { source, steps } = lifecycleSource();
    const summerSale = source.bindFlag('summer-sale');

    // e.g. in the AWS Lambda init phase
    await runtime.onInit();
    await summerSale();
    await summerSale();

    expect(steps).toEqual([
      'remote: initialize',
      'remote: evaluate summer-sale',
      'remote: evaluate summer-sale',
    ]);
  });

  it('initializes a provider on its first evaluation without onInit', async () => {
    const { source, steps } = lifecycleSource();
    const summerSale = source.bindFlag('summer-sale');

    await summerSale();

    expect(steps).toEqual([
      'remote: initialize',
      'remote: evaluate summer-sale',
    ]);
  });

  it('does not let a slow provider delay the flags of a different provider', async () => {
    const slow = lifecycleSource('slow');
    const fast = defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
    });
    slow.source.bindFlag('summer-sale');
    const summerSale = fast.bindFlag('summer-sale');

    // onInvoke starts the initialization of "slow", but does not wait for it
    const value = await runtime.onInvoke(
      new Request('https://shop.example'),
      () => summerSale(),
    );

    expect(value).toBe(true);
    expect(slow.steps).toEqual(['slow: initialize']);
    await runtime.waitForInitialization();
  });

  it('closes the providers on shutdown', async () => {
    const { source, steps } = lifecycleSource();
    source.bindFlag('summer-sale');

    await runtime.onInit();
    await runtime.onShutdown();

    expect(steps).toEqual(['remote: initialize', 'remote: close']);
  });
});

describe('7. Registration', () => {
  it('registers sources whose flags are defined later', async () => {
    const { source, steps } = lifecycleSource();

    // No flag of this source is defined yet, e.g. because its module is
    // imported later. Thus, onInit only knows the source through this:
    registerSources([source]);
    await runtime.onInit();

    expect(steps).toEqual(['remote: initialize']);
  });

  it('registers the flags of a module, e.g. a "use flags" module', () => {
    const source = defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
    });
    // The framework plugins append this to each 'use flags' module:
    // import * as self from './flags'; registerFlags(self);
    const flagsModule = {
      summerSale: source.bindFlag('summer-sale'),
      newCheckout: source.bindFlag('new-checkout'),
    };

    expect(() => registerFlags(flagsModule)).not.toThrow();
    expect(() => registerFlags({ notAFlag: () => true })).toThrow(
      'flags: registerFlags expects only flags, but export "notAFlag" is not a flag.',
    );
  });
});

describe('8. One runtime for each process', () => {
  it('lets Next.js set the request getter in instrumentation.ts', async () => {
    // Next.js can bundle instrumentation.ts and the pages separately, so
    // each bundle can have its own copy of the package
    vi.resetModules();
    const instrumentation: typeof import('./runtime-module') = await import(
      './runtime-module'
    );

    // instrumentation.ts, register(): one time for each process
    const headers = new Headers({ cookie: 'user=alice' });
    instrumentation.runtime.setGetRequest(async () => ({ headers }));

    // A page, with a different copy of the package
    const source = defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
      getEvaluationContext: (request) => ({
        user: request?.cookies?.get('user')?.value ?? 'anonymous',
      }),
    });
    const newCheckout = source.bindFlag('new-checkout');

    expect(instrumentation.runtime).toBe(runtime);
    expect(await newCheckout()).toBe(true);
  });
});

describe('9. Overrides', () => {
  // An override sets the value of a flag for one browser, e.g. from the
  // Vercel Toolbar. It is a cookie, and it must be trusted: either encrypted
  // with a shared secret, or signed by Vercel.

  const source = () =>
    defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
    });

  it('overrides a flag with a cookie which the shared secret encrypts', async () => {
    // FLAGS_SECRET is 32 random bytes as base64url. With it, the SDK needs
    // no configuration, as in v4.
    vi.stubEnv(
      'FLAGS_SECRET',
      Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
        'base64url',
      ),
    );
    const newCheckout = source().bindFlag('new-checkout');

    // e.g. in a test or in CI
    const token = await encryptOverrides({ 'new-checkout': true });
    expect(await decryptOverrides(token)).toEqual({ 'new-checkout': true });

    const request = new Request('https://shop.example', {
      headers: { cookie: `flag-overrides=${token}` },
    });
    // Without the override, new-checkout is off for this user
    expect(await runtime.onInvoke(request, () => newCheckout())).toBe(true);
  });

  it('accepts longer lifetimes of signed cookies when configured', () => {
    // flags/config.json: { "overrides": { "vercel": { ... } } }. The
    // default is 7 days.
    const config: Config = {
      settings: {
        overrides: {
          vercel: {
            project: { projectId: 'prj_shop', environment: 'preview' },
            maxLifetimeSeconds: 30 * 24 * 60 * 60,
          },
        },
      },
    };

    expect(() => runtime.configure(config)).not.toThrow();
  });

  it('needs no configuration on Vercel for cookies which Vercel signs', async () => {
    // What Vercel sets for a deployment
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_PROJECT_ID', 'prj_shop');
    vi.stubEnv('VERCEL_TARGET_ENV', 'preview');
    vi.stubEnv('FLAGS_SECRET', '');

    // The issuer publishes its public keys. Only for this walkthrough, they
    // come from memory instead of the network.
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const publicKeys = {
      keys: [{ ...(await exportJWK(publicKey)), kid: 'key-1' }],
    };
    vi.stubGlobal('fetch', async () => Response.json(publicKeys));

    const newCheckout = source().bindFlag('new-checkout');

    // What the Vercel Toolbar does: sign the override for this project
    const token = await new SignJWT({
      ver: 1,
      pur: 'flag-overrides',
      scope: { projectIds: ['prj_shop'], environments: ['preview'] },
      overrides: { 'new-checkout': true },
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'key-1' })
      .setIssuer(VERCEL_TOOLBAR_ISSUER)
      .setAudience('vercel:flag-overrides')
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(privateKey);

    const request = new Request('https://shop.example', {
      headers: { cookie: `flag-overrides=${token}` },
    });
    expect(await runtime.onInvoke(request, () => newCheckout())).toBe(true);
  });

  it('needs no configuration locally for cookies which Flags Explorer signs', async () => {
    // vercel env pull writes VERCEL_OIDC_TOKEN. Its claims tell the SDK the
    // project and the environment, also without VERCEL_PROJECT_ID.
    const oidcToken = await new SignJWT({
      project_id: 'prj_shop',
      owner_id: 'team_acme',
      environment: 'development',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(crypto.getRandomValues(new Uint8Array(32)));
    vi.stubEnv('VERCEL_OIDC_TOKEN', oidcToken);
    vi.stubEnv('FLAGS_SECRET', '');

    // The public keys of the issuer, from memory for this walkthrough
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const publicKeys = {
      keys: [{ ...(await exportJWK(publicKey)), kid: 'key-1' }],
    };
    vi.stubGlobal('fetch', async () => Response.json(publicKeys));

    const newCheckout = source().bindFlag('new-checkout');

    // What Flags Explorer does in local development
    const token = await new SignJWT({
      ver: 1,
      pur: 'flag-overrides',
      scope: {
        teamId: 'team_acme',
        projectIds: ['prj_shop'],
        environments: ['development'],
      },
      overrides: { 'new-checkout': true },
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'key-1' })
      .setIssuer(VERCEL_TOOLBAR_ISSUER)
      .setAudience('vercel:flag-overrides')
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(privateKey);

    const request = new Request('http://localhost:3000', {
      headers: { cookie: `flag-overrides=${token}` },
    });
    expect(await runtime.onInvoke(request, () => newCheckout())).toBe(true);
  });

  it('ignores a cookie which is not trusted', async () => {
    const newCheckout = source().bindFlag('new-checkout');
    const request = new Request('https://shop.example', {
      headers: { cookie: 'flag-overrides=I-want-the-new-checkout' },
    });
    const warnings: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((message) => {
      warnings.push(String(message));
    });

    expect(await runtime.onInvoke(request, () => newCheckout())).toBe(false);
    expect(warnings).toEqual([
      'flags: The override cookie was ignored. Reason: malformed-token.',
    ]);
  });
});

describe('10. Explicit sources and the optional flags/config.ts', () => {
  // Each flag names its source: there is no default source. The
  // configuration is optional. flags/config.ts only adds settings for all
  // flags, e.g. hooks and overrides.

  it('adds hooks for all flags in flags/config.ts', async () => {
    // flags/sources/shop.ts: a source with an evaluation context from a cookie
    const shop = defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
      getEvaluationContext: (request) => ({
        user: request?.cookies?.get('user')?.value ?? 'anonymous',
      }),
    });
    const newCheckout = shop.bindFlag('new-checkout');
    const summerSale = shop.bindFlag('summer-sale');

    // flags/hooks.ts: a hook which logs each evaluation
    const evaluated: string[] = [];
    const config: Config = {
      hooks: [
        {
          after: (hookContext, details) => {
            evaluated.push(`${hookContext.flagKey}=${details.value}`);
          },
        },
      ],
    };
    // The framework binding does this
    runtime.configure(config);

    const request = new Request('https://shop.example', {
      headers: { cookie: 'user=alice' },
    });
    const [checkout, sale] = await runtime.onInvoke(request, () =>
      evaluate([newCheckout, summerSale]),
    );

    // new-checkout is on for alice only
    expect(checkout).toBe(true);
    expect(sale).toBe(true);
    expect(evaluated).toEqual(['new-checkout=true', 'summer-sale=true']);
  });

  it('rejects a defaultSource in the configuration', () => {
    const shop = defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
    });
    expect(() =>
      // @ts-expect-error the configuration has no defaultSource
      runtime.configure({ defaultSource: shop }),
    ).toThrow('Give each flag its source');
  });
});

describe('11. Flag value types', () => {
  // Without a type, a flag is a boolean. Each other type must be set with
  // type. The names are those of OpenFeature.

  const source = () =>
    defineSource({
      provider: new TypedInMemoryProvider({
        'banner-text': {
          variants: { welcome: 'Welcome', sale: 'Summer sale!' },
          defaultVariant: 'sale',
          disabled: false,
        },
        'max-items': {
          variants: { few: 3, many: 10 },
          defaultVariant: 'many',
          disabled: false,
        },
        checkout: {
          variants: { control: 'control', express: 'express' },
          defaultVariant: 'express',
          disabled: false,
        },
        theme: {
          variants: { light: { color: 'white' }, dark: { color: 'black' } },
          defaultVariant: 'dark',
          disabled: false,
        },
      } as const),
      project: { system: 'in-memory' },
    });

  it('evaluates strings, numbers and objects', async () => {
    const c = source();
    const bannerText = c.bindFlag('banner-text', {
      type: 'string',
    });
    const maxItems = c.bindFlag('max-items', {
      type: 'number',
    });
    const theme = c.bindFlag('theme', { type: 'object' });

    expect(await evaluate([bannerText, maxItems, theme])).toEqual([
      'Summer sale!',
      10,
      { color: 'black' },
    ]);
  });

  it('lists the options of a flag, e.g. for Flags Explorer', async () => {
    const checkout = source().bindFlag('checkout', {
      type: 'string',
      // The editor suggests 'control' and 'express'. The provider can also
      // return a value which the code does not know yet, so the type is
      // 'control' | 'express' | (string & {}).
      options: [
        { value: 'control', label: 'Old checkout' },
        { value: 'express', label: 'Express checkout' },
      ],
      defaultValue: 'control',
    });

    expect(await checkout()).toBe('express');
    expect(checkout.options?.map((option) => option.label)).toEqual([
      'Old checkout',
      'Express checkout',
    ]);
  });

  it('shows a type error for a value which does not fit the type', () => {
    const c = source();
    void (() => {
      c.bindFlag('banner-text', {
        // @ts-expect-error without a type, a flag is a boolean
        defaultValue: 'Welcome',
      });
      c.bindFlag('max-items', {
        type: 'number',
        // @ts-expect-error a number flag needs a number
        defaultValue: 'many',
      });
    });
  });
});

describe('12. What a framework binding does', () => {
  // A framework plugin points the alias flags/framework to its module,
  // e.g. withFlags of @flags-sdk/next/plugin points it to the binding. That module
  // calls these three methods. The application does not call them.
  // tests/standard/next tests the real integration of Next.js.

  it('gives the runtime the request, the configuration and the signals', async () => {
    class RenderSignal extends Error {}
    const headers = new Headers({ cookie: 'user=alice' });

    // Next.js: headers() and cookies() of the current request
    runtime.setGetRequest(async () => ({ headers }));
    // flags/hooks.ts. In development, the runtime loads it again.
    const evaluated: string[] = [];
    runtime.setLoadConfig(
      (): Config => ({
        hooks: [
          {
            after: (hookContext) => {
              evaluated.push(hookContext.flagKey);
            },
          },
        ],
      }),
    );
    // Errors which the framework must receive, e.g. unstable_rethrow
    runtime.setRethrow((error) => {
      if (error instanceof RenderSignal) throw error;
    });

    const newCheckout = defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
      getEvaluationContext: (request) => ({
        user: request?.cookies?.get('user')?.value ?? 'anonymous',
      }),
    }).bindFlag('new-checkout');
    expect(await newCheckout()).toBe(true);
    expect(evaluated).toEqual(['new-checkout']);
  });
});

describe('13. Hooks, events and tracking', () => {
  // The SDK calls the providers without the OpenFeature client, so it does
  // the work of the client itself

  it('runs OpenFeature hooks, e.g. to log each evaluation', async () => {
    const logs: string[] = [];
    const logEvaluations: Hook = {
      after: (hookContext, details) => {
        logs.push(
          `${hookContext.flagKey}=${details.value} (${details.reason})`,
        );
      },
    };
    // flags/hooks.ts: hooks for all flags. A source and the call side
    // can add more.
    runtime.configure({ hooks: [logEvaluations] });
    const newCheckout = defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
    }).bindFlag('new-checkout');

    await newCheckout({ evaluationContext: { user: 'alice' } });
    expect(logs).toEqual(['new-checkout=true (TARGETING_MATCH)']);
  });

  it('reports overrides with a hook', async () => {
    vi.stubEnv(
      'FLAGS_SECRET',
      Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
        'base64url',
      ),
    );
    const overridden: string[] = [];
    runtime.configure({
      hooks: [
        {
          after: (hookContext, details) => {
            if (details.reason === OVERRIDE_REASON) {
              overridden.push(hookContext.flagKey);
            }
          },
        },
      ],
    });
    const newCheckout = defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
    }).bindFlag('new-checkout');
    const token = await encryptOverrides({ 'new-checkout': true });
    const request = new Request('https://shop.example', {
      headers: { cookie: `flag-overrides=${token}` },
    });

    expect(await runtime.onInvoke(request, () => newCheckout())).toBe(true);
    expect(overridden).toEqual(['new-checkout']);
  });

  it('gives the events of the providers to the handlers', async () => {
    const events: string[] = [];
    runtime.addHandler('PROVIDER_READY', (details) => {
      events.push(`${details.providerName} is ready`);
    });
    const { source } = lifecycleSource('remote');
    source.bindFlag('summer-sale');

    await runtime.onInit();
    expect(events).toEqual(['remote is ready']);
  });

  it('records tracking events, e.g. a purchase for an experiment', async () => {
    const provider = Object.assign(createProvider(), { track: vi.fn() });
    const shop = defineSource({
      provider,
      project: { system: 'in-memory' },
      getEvaluationContext: (_request, context: { user: string }) => context,
    });

    await track(shop, 'purchase', {
      evaluationContext: { user: 'alice' },
      details: { value: 99 },
    });
    // The provider receives the context of the source, as for a flag
    expect(provider.track).toHaveBeenCalledWith(
      'purchase',
      { user: 'alice' },
      { value: 99 },
    );
  });
});

describe('14. Discovery for Flags Explorer', () => {
  // Optional, on top of the rest. The framework packages (e.g.
  // @flags-sdk/next) or the script `flags manifest` import the
  // modules with 'use flags' and create the manifest from their exports.

  it('creates the manifest from the exports of a use flags module', () => {
    // flags.ts starts with 'use flags': it exports only flags, and importing
    // it has no side effects
    const vercel = defineSource({
      provider: createProvider(),
      project: { system: 'vercel-flags' },
    });
    const flagsModule = {
      checkout: vercel.bindFlag('checkout', {
        type: 'string',
        options: ['control', 'express'],
        defaultValue: 'control',
        description: 'The checkout flow',
      }),
      // Any object with a key is a flag, not only a flag of defineFlag or bindFlag
      theme: { key: 'theme', type: 'string', options: ['light', 'dark'] },
    };

    const manifest = createManifest([{ id: 'flags.ts', exports: flagsModule }]);

    // No values and no secrets: the manifest evaluates nothing
    expect(manifest.definitions.checkout).toEqual({
      type: 'string',
      options: [{ value: 'control' }, { value: 'express' }],
      defaultValue: 'control',
      description: 'The checkout flow',
      declaredInCode: true,
      // The id of the source in manifest.sources
      source: 'vercel-flags',
      declarations: [{ module: 'flags.ts', export: 'checkout' }],
    });
    expect(Object.keys(manifest.definitions)).toEqual(['checkout', 'theme']);
  });

  it('lets a tool build the links to the dashboard of the system', () => {
    const launchdarkly = defineSource({
      provider: createProvider(),
      project: { system: 'launchdarkly', projectId: 'shop', teamId: 'acme' },
    });
    const manifest = createManifest([
      {
        id: 'flags.ts',
        exports: {
          summerSale: launchdarkly.bindFlag('summer-sale'),
        },
      },
    ]);

    // The manifest has only the variables, not the links
    const source = manifest.sources.launchdarkly;
    expect(source?.variables).toEqual({
      projectId: 'shop',
      teamId: 'acme',
    });

    // A tool fetches source.systemManifest, which the system can
    // change at any time, and builds the links
    const systemManifest = {
      version: 1,
      name: 'LaunchDarkly',
      links: {
        flag: 'https://app.launchdarkly.com/projects/{projectId}/flags/{flagKey}',
      },
    } as const;
    expect(
      resolveFlagLinks(systemManifest, source?.variables ?? {}, 'summer-sale'),
    ).toEqual({
      flag: 'https://app.launchdarkly.com/projects/shop/flags/summer-sale',
    });
  });

  it('registers the flags of a use flags module', () => {
    const remote = defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
    });

    // The framework plugins append this call to each 'use flags' module.
    // Without a plugin, call it with the module namespace object.
    registerFlags({ plain: { key: 'plain', source: remote } });

    expect(runtime.sources.has(remote)).toBe(true);
  });
});

describe('15. Code generation from catalogs', () => {
  // An application puts each source into flags/sources/<source>:
  // catalog.ts (the flags, for the code generation), provider.ts (the
  // OpenFeature provider) and context.ts (getEvaluationContext).
  // `flags sync`, `flags watch` or a framework plugin write the module of
  // flags:<source> into .flags. It is the same code as defineSource and
  // bindFlag by hand.

  it('writes the module of flags:<source> from flags/sources/<source>', async () => {
    const app = await mkdtemp(join(__dirname, '../.flags-walkthrough-'));
    try {
      const shop = join(app, 'flags/sources/shop');
      await mkdir(shop, { recursive: true });
      await writeFile(
        join(shop, 'catalog.ts'),
        `import type { CatalogLoader } from 'flags';
        // Usually loaded from the flag management system
        const loadCatalog: CatalogLoader = async () => ({
          flags: {
            'summer-sale': { variants: [false, true], description: 'The sale' },
          },
        });
        export default loadCatalog;`,
      );
      await writeFile(
        join(shop, 'provider.ts'),
        `import { TypedInMemoryProvider } from '@openfeature/server-sdk';
        export default new TypedInMemoryProvider({
          'summer-sale': {
            variants: { on: true, off: false },
            defaultVariant: 'off',
            disabled: false,
            contextEvaluator: (context) => (context.user === 'alice' ? 'on' : 'off'),
          },
        });`,
      );
      await writeFile(
        join(shop, 'context.ts'),
        `import type { FlagsRequest } from 'flags';
        export default (request: FlagsRequest | undefined) => ({
          user: request?.cookies?.get('user')?.value ?? 'anonymous',
        });`,
      );

      // e.g. `flags sync`. The framework plugin points flags:shop to it.
      expect(await generateFlags(app)).toEqual({
        'flags:shop': './.flags/shop.ts',
      });

      // import { 'summer-sale' as summerSale } from 'flags:shop';
      const { 'summer-sale': summerSale } = await import(
        pathToFileURL(join(app, '.flags/shop.ts')).href
      );
      const request = new Request('https://shop.example', {
        headers: { cookie: 'user=alice' },
      });
      expect(await runtime.onInvoke(request, () => summerSale())).toBe(true);
      expect(summerSale.description).toBe('The sale');
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });
});

describe('16. Flags files', () => {
  // An application declares its flags in flags files, by default
  // app.flags: `source <name>`, then `flag <key> { … }` for each flag,
  // with its key and what the code knows about it. The body is JSON5: JSON
  // with keys without quotes and comments, and a new line works as a
  // comma. The source comes from
  // flags/sources/<source>, as for code generation, but there is no
  // catalog: nothing is downloaded, and a branch which adds a flag shows it
  // in its diff. A framework plugin (or `node --import flags/register`)
  // compiles each file into the same code as defineSource and bindFlag.

  it('compiles app.flags into a module of its flags', async () => {
    const app = await mkdtemp(join(__dirname, '../.flags-walkthrough-'));
    try {
      await writeFile(join(app, 'package.json'), '{}');
      const shop = join(app, 'flags/sources/shop');
      await mkdir(shop, { recursive: true });
      await writeFile(
        join(shop, 'provider.ts'),
        `import { TypedInMemoryProvider } from '@openfeature/server-sdk';
        export default new TypedInMemoryProvider({
          'summer-sale': {
            variants: { on: true, off: false },
            defaultVariant: 'off',
            disabled: false,
            contextEvaluator: (context) => (context.user === 'alice' ? 'on' : 'off'),
          },
        });`,
      );
      await writeFile(
        join(shop, 'context.ts'),
        `import type { FlagsRequest } from 'flags';
        export default (request: FlagsRequest | undefined) => ({
          user: request?.cookies?.get('user')?.value ?? 'anonymous',
        });`,
      );
      const text = `source shop

flag summer-sale {
  description: "Shows the summer sale banner"
  defaultValue: false
}

flag checkout {
  options: ["control", "express"]
  defaultValue: "control"
}
`;

      // What the loader of a framework plugin does with app.flags
      const { code } = compileFlagsFile(text, {
        fileName: join(app, 'app.flags'),
        selfRegistration: false,
      });
      await writeFile(join(app, 'app.flags.ts'), code);

      // import { checkout, summerSale } from './app.flags';
      const { checkout, summerSale } = await import(
        pathToFileURL(join(app, 'app.flags.ts')).href
      );
      const request = new Request('https://shop.example', {
        headers: { cookie: 'user=alice' },
      });
      expect(await runtime.onInvoke(request, () => summerSale())).toBe(true);
      expect(summerSale.key).toBe('summer-sale');
      expect(summerSale.description).toBe('Shows the summer sale banner');
      // The provider has no "checkout" yet: the code works before the flag
      // exists in the flag management system
      expect(await runtime.onInvoke(request, () => checkout())).toBe('control');
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });

  it('points to each mistake in a flags file', () => {
    const { diagnostics } = parseFlagsFile(
      'flag summer-sale {\n  defualtValue: false,\n}\n',
    );
    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      'Unknown field "defualtValue" in the flag "summer-sale". Did you mean "defaultValue"?',
    ]);
  });
});
