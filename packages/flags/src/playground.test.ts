/**
 * A walkthrough of the features of the SDK. Each group shows one feature as
 * an application would use it. The tests show that the features work and how
 * the API feels. They do not test each detail: the other test files do that.
 *
 * Keep this file up to date when you add a feature.
 */
import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureOverrides,
  decryptOverrides,
  defineConnection,
  defineFlag,
  encryptOverrides,
  evaluate,
  FlagEvaluationError,
  type Provider,
  registerConnections,
  registerFlags,
  runtime,
} from './index';
// Only to sign tokens like the Vercel Toolbar: the issuer which the SDK trusts
import { VERCEL_TOOLBAR_ISSUER } from './overrides/vercel';

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
function lifecycleConnection(name = 'remote') {
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
  const connection = defineConnection({
    provider,
    project: { platform: 'in-memory' },
  });
  return { connection, steps };
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
  runtime.setRequestSource(undefined);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('1. Connections and flags', () => {
  it('defines a flag and evaluates it', async () => {
    // A connection links flags to a project on a platform, and to the
    // provider which evaluates them
    const launchdarkly = defineConnection({
      provider: createProvider(),
      project: { platform: 'launchdarkly', projectId: 'shop', teamId: 'acme' },
    });

    const summerSale = defineFlag({
      key: 'summer-sale',
      connection: launchdarkly,
    });

    expect(await summerSale()).toBe(true);
  });

  it('gives each flag access to its project', () => {
    const launchdarkly = defineConnection({
      provider: createProvider(),
      project: { platform: 'launchdarkly', projectId: 'shop', teamId: 'acme' },
    });
    const summerSale = defineFlag({
      key: 'summer-sale',
      connection: launchdarkly,
    });

    expect(summerSale.key).toBe('summer-sale');
    expect(summerSale.connection.project).toEqual({
      platform: 'launchdarkly',
      projectId: 'shop',
      teamId: 'acme',
    });
  });

  it('requires the fields of the platform', () => {
    void (() => {
      defineConnection({
        provider: createProvider(),
        // @ts-expect-error launchdarkly requires projectId and teamId
        project: { platform: 'launchdarkly' },
      });
      // in-memory requires no fields
      defineConnection({
        provider: createProvider(),
        project: { platform: 'in-memory' },
      });
    });
  });
});

describe('2. Default values and errors', () => {
  const connection = () =>
    defineConnection({
      provider: createProvider(),
      project: { platform: 'in-memory' },
    });

  it('returns the default value and logs one line when a flag fails', async () => {
    const missing = defineFlag({
      key: 'does-not-exist',
      defaultValue: false,
      connection: connection(),
    });

    expect(await missing()).toBe(false);
    expect(errors).toEqual([
      'flags: Could not evaluate flag "does-not-exist": no flag found with key does-not-exist. Returned the default value: false.',
    ]);
  });

  it('throws when a flag without a default value fails', async () => {
    const missing = defineFlag({
      key: 'does-not-exist',
      connection: connection(),
    });

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
    const connection = defineConnection({
      provider: createProvider(),
      project: { platform: 'in-memory' },
    });
    const summerSale = defineFlag({ key: 'summer-sale', connection });
    const newCheckout = defineFlag({ key: 'new-checkout', connection });

    const [sale, checkout] = await evaluate([summerSale, newCheckout]);

    expect(sale).toBe(true);
    expect(checkout).toBe(false);
  });

  it('evaluates a key which is only known at runtime', async () => {
    const connection = defineConnection({
      provider: createProvider(),
      project: { platform: 'in-memory' },
    });
    const key = ['summer', 'sale'].join('-');

    expect(await evaluate({ key, connection })).toBe(true);
  });
});

describe('4. The evaluation context chain', () => {
  // The context flows from the call side, through the flag, to the
  // connection. Each step can change it.

  it('passes the context of the call side to the connection', async () => {
    const connection = defineConnection({
      provider: createProvider(),
      project: { platform: 'in-memory' },
      // The connection decides what its flags must give
      getEvaluationContext: (context: { user: string }) => ({
        user: context.user,
      }),
    });
    const newCheckout = defineFlag({ key: 'new-checkout', connection });

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

    const connection = defineConnection({
      provider: createProvider(),
      project: { platform: 'in-memory' },
      // The connection loads the team, e.g. from a database
      getEvaluationContext: async (context: {
        teamId: keyof typeof teams;
      }) => ({
        team: teams[context.teamId],
      }),
    });
    const teamInsights = defineFlag({ key: 'team-insights', connection });

    // e.g. GET /api/teams/team-1/insights
    expect(
      await teamInsights({ evaluationContext: { teamId: 'team-1' } }),
    ).toBe(true);
    expect(
      await teamInsights({ evaluationContext: { teamId: 'team-2' } }),
    ).toBe(false);
  });

  it('lets a flag convert the context between the call side and the connection', async () => {
    const connection = defineConnection({
      provider: createProvider(),
      project: { platform: 'in-memory' },
      getEvaluationContext: (context: { teamId: string }) => ({
        team: { plan: context.teamId === 'id-of-acme' ? 'enterprise' : 'free' },
      }),
    });

    // The call side knows the slug, the connection needs the id
    const teamInsights = defineFlag({
      key: 'team-insights',
      connection,
      getEvaluationContext: (context: { slug: string }) => ({
        teamId: `id-of-${context.slug}`,
      }),
    });

    expect(await teamInsights({ evaluationContext: { slug: 'acme' } })).toBe(
      true,
    );
  });

  it('checks the context at the type level', () => {
    const connection = defineConnection({
      provider: createProvider(),
      project: { platform: 'in-memory' },
      getEvaluationContext: (context: { teamId: string }) => ({
        team: context.teamId,
      }),
    });
    const teamInsights = defineFlag({ key: 'team-insights', connection });

    void (() => {
      teamInsights({ evaluationContext: { teamId: 'team-1' } });
      // @ts-expect-error the connection needs a teamId
      teamInsights();
      // @ts-expect-error teamId must be a string
      teamInsights({ evaluationContext: { teamId: 1 } });
    });
  });
});

describe('5. Requests', () => {
  // The connection reads the user from a cookie of the current request
  function cookieConnection() {
    const calls = { count: 0 };
    const connection = defineConnection({
      provider: createProvider(),
      project: { platform: 'in-memory' },
      getEvaluationContext: (_context, request) => {
        calls.count++;
        return { user: request?.cookies?.get('user')?.value ?? 'anonymous' };
      },
    });
    return { connection, calls };
  }

  it('gives each step the request of a middleware', async () => {
    const { connection } = cookieConnection();
    const newCheckout = defineFlag({ key: 'new-checkout', connection });

    // e.g. in Hono: app.use((c, next) => runtime.onInvoke(c.req.raw, next))
    const request = new Request('https://shop.example/checkout', {
      headers: { cookie: 'user=alice' },
    });
    const result = await runtime.onInvoke(request, () => newCheckout());

    expect(result).toBe(true);
  });

  it('gives each step the standard request: headers, cookies and URL', async () => {
    let seen: unknown;
    const connection = defineConnection({
      provider: createProvider(),
      project: { platform: 'in-memory' },
      getEvaluationContext: (_context, request) => {
        seen = {
          header: request?.headers?.get('accept-language'),
          cookie: request?.cookies?.get('user')?.value,
          path: request?.url?.pathname,
        };
        return {};
      },
    });
    const summerSale = defineFlag({ key: 'summer-sale', connection });

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
    const { connection, calls } = cookieConnection();
    const summerSale = defineFlag({ key: 'summer-sale', connection });
    const newCheckout = defineFlag({ key: 'new-checkout', connection });

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

  it('works like Next.js, which gives only headers() and cookies()', async () => {
    const { connection, calls } = cookieConnection();
    const newCheckout = defineFlag({ key: 'new-checkout', connection });

    // Next.js: headers() returns the same object during one request, so the
    // SDK can identify the request without a middleware
    const headers = new Headers({ cookie: 'user=alice' });
    runtime.setRequestSource(async () => ({ headers }));

    expect(await newCheckout()).toBe(true);
    expect(await newCheckout()).toBe(true);
    expect(calls.count).toBe(1);
  });

  it('uses no request outside of a request, e.g. in a script', async () => {
    const { connection } = cookieConnection();
    const newCheckout = defineFlag({ key: 'new-checkout', connection });

    expect(await newCheckout()).toBe(false); // user is "anonymous"
  });
});

describe('6. Runtime lifecycle', () => {
  it('initializes the providers before the first request', async () => {
    const { connection, steps } = lifecycleConnection();
    const summerSale = defineFlag({ key: 'summer-sale', connection });

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
    const { connection, steps } = lifecycleConnection();
    const summerSale = defineFlag({ key: 'summer-sale', connection });

    await summerSale();

    expect(steps).toEqual([
      'remote: initialize',
      'remote: evaluate summer-sale',
    ]);
  });

  it('does not let a slow provider delay the flags of a different provider', async () => {
    const slow = lifecycleConnection('slow');
    const fast = defineConnection({
      provider: createProvider(),
      project: { platform: 'in-memory' },
    });
    defineFlag({ key: 'summer-sale', connection: slow.connection });
    const summerSale = defineFlag({ key: 'summer-sale', connection: fast });

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
    const { connection, steps } = lifecycleConnection();
    defineFlag({ key: 'summer-sale', connection });

    await runtime.onInit();
    await runtime.onShutdown();

    expect(steps).toEqual(['remote: initialize', 'remote: close']);
  });
});

describe('7. Registration', () => {
  it('registers connections whose flags are defined later', async () => {
    const { connection, steps } = lifecycleConnection();

    // No flag of this connection is defined yet, e.g. because its module is
    // imported later. Thus, onInit only knows the connection through this:
    registerConnections([connection]);
    await runtime.onInit();

    expect(steps).toEqual(['remote: initialize']);
  });

  it('registers the flags of a module, e.g. a "use flags" module', () => {
    const connection = defineConnection({
      provider: createProvider(),
      project: { platform: 'in-memory' },
    });
    // In a module: import * as self from './flags'; registerFlags(self);
    const flagsModule = {
      summerSale: defineFlag({ key: 'summer-sale', connection }),
      newCheckout: defineFlag({ key: 'new-checkout', connection }),
    };

    expect(() => registerFlags(flagsModule)).not.toThrow();
    expect(() => registerFlags({ notAFlag: () => true })).toThrow(
      'flags: registerFlags expects only flags, but export "notAFlag" is not a flag.',
    );
  });
});

describe('8. One runtime for each process', () => {
  it('lets Next.js set the request source in instrumentation.ts', async () => {
    // Next.js can bundle instrumentation.ts and the pages separately, so
    // each bundle can have its own copy of the package
    vi.resetModules();
    const instrumentation: typeof import('./index') = await import('./index');

    // instrumentation.ts, register(): one time for each process
    const headers = new Headers({ cookie: 'user=alice' });
    instrumentation.runtime.setRequestSource(async () => ({ headers }));

    // A page, with a different copy of the package
    const connection = defineConnection({
      provider: createProvider(),
      project: { platform: 'in-memory' },
      getEvaluationContext: (_context, request) => ({
        user: request?.cookies?.get('user')?.value ?? 'anonymous',
      }),
    });
    const newCheckout = defineFlag({ key: 'new-checkout', connection });

    expect(instrumentation.defineFlag).not.toBe(defineFlag);
    expect(instrumentation.runtime).toBe(runtime);
    expect(await newCheckout()).toBe(true);
  });
});

describe('9. Overrides', () => {
  // An override sets the value of a flag for one browser, e.g. from the
  // Vercel Toolbar. It is a cookie, and it must be trusted: either encrypted
  // with a shared secret, or signed by Vercel.

  const connection = () =>
    defineConnection({
      provider: createProvider(),
      project: { platform: 'in-memory' },
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
    const newCheckout = defineFlag({
      key: 'new-checkout',
      connection: connection(),
    });

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
    // The default is 24 hours
    expect(() =>
      configureOverrides({
        vercel: {
          project: { projectId: 'prj_shop', environment: 'preview' },
          maxLifetimeSeconds: 7 * 24 * 60 * 60,
        },
      }),
    ).not.toThrow();
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

    const newCheckout = defineFlag({
      key: 'new-checkout',
      connection: connection(),
    });

    // What the Vercel Toolbar does: sign the override for this project
    const token = await new SignJWT({
      ver: 1,
      pur: 'flag-overrides',
      scope: { projectId: 'prj_shop', environments: ['preview'] },
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

    const newCheckout = defineFlag({
      key: 'new-checkout',
      connection: connection(),
    });

    // What Flags Explorer does in local development
    const token = await new SignJWT({
      ver: 1,
      pur: 'flag-overrides',
      scope: {
        teamId: 'team_acme',
        projectId: 'prj_shop',
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
    const newCheckout = defineFlag({
      key: 'new-checkout',
      connection: connection(),
    });
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
