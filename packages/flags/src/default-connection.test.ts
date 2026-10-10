import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import { defineConfig } from './config';
import { type DefaultConnectionInput, defineConnection } from './connection';
import {
  type DefaultConnection,
  getBuiltInConnection,
} from './default-connection';
import {
  resetProductionWarning,
  VERCEL_OFREP_BASE_URL,
} from './default-provider';
import { evaluate, type FlagEvaluationContext } from './evaluate';
import { defineFlag } from './flag';
import { runtime } from './runtime';
import type { Provider } from './types';

function ofrepServer(value: boolean) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    Response.json({ key: 'a', value, reason: 'STATIC' }),
  );
}

function connectionOf(value: boolean, name = 'app') {
  const provider = {
    metadata: { name },
    initialize: vi.fn(async () => {}),
    resolveBooleanEvaluation: vi.fn(async () => ({ value })),
  } satisfies Provider;
  return defineConnection({ provider, project: { platform: 'in-memory' } });
}

let warnings: string[];

beforeEach(() => {
  runtime.reset();
  resetProductionWarning();
  vi.stubEnv('VERCEL_OIDC_TOKEN', '');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  warnings = [];
  vi.spyOn(console, 'warn').mockImplementation((message) => {
    warnings.push(String(message));
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('built-in default connection', () => {
  it('is the connection of a flag without a connection', () => {
    const flag = defineFlag({ key: 'a' });

    expect(flag.connection).toBe(getBuiltInConnection());
    expect(flag.connection.project).toEqual({ platform: 'vercel' });
    expectTypeOf(flag.connection).toEqualTypeOf<DefaultConnection>();
  });

  it('accepts any evaluation context', () => {
    const flag = defineFlag({ key: 'a' });
    expectTypeOf<
      FlagEvaluationContext<typeof flag>
    >().toEqualTypeOf<DefaultConnectionInput>();

    void (() => {
      flag();
      flag({ evaluationContext: { user: 'alice' } });
    });
  });

  it('is the same for each copy of the package', async () => {
    vi.resetModules();
    const copy: typeof import('./index') = await import('./index');

    expect(copy.defineFlag({ key: 'a' }).connection).toBe(
      defineFlag({ key: 'a' }).connection,
    );
  });

  it('uses OFREP with the OIDC token of vercel env pull', async () => {
    vi.stubEnv('VERCEL_OIDC_TOKEN', 'oidc-token-1');
    const fetch = ofrepServer(true);
    vi.stubGlobal('fetch', fetch);

    await expect(
      defineFlag({ key: 'a' })({ evaluationContext: { user: 'alice' } }),
    ).resolves.toBe(true);

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      `${VERCEL_OFREP_BASE_URL}/ofrep/v1/evaluate/flags/a`,
    );
    expect(init?.headers).toMatchObject({
      authorization: 'Bearer oidc-token-1',
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      context: { user: 'alice' },
    });
  });

  it('reads the OIDC token for each request', async () => {
    vi.stubEnv('VERCEL_OIDC_TOKEN', 'oidc-token-1');
    const fetch = ofrepServer(true);
    vi.stubGlobal('fetch', fetch);
    const flag = defineFlag({ key: 'a' });

    await flag();
    vi.stubEnv('VERCEL_OIDC_TOKEN', 'oidc-token-2');
    await flag();

    expect(fetch.mock.calls[1]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer oidc-token-2',
    });
  });

  it('throws when the project is not connected to Vercel', async () => {
    await expect(defineFlag({ key: 'a' })()).rejects.toMatchObject({
      name: 'FlagEvaluationError',
      message:
        'flags: Could not evaluate flag "a": A flag without a connection uses Vercel Flags, but the project is not connected to Vercel. Run `vercel link` and `vercel env pull`, set a default connection in flags.config.ts, or pass a connection to defineFlag.',
    });
  });

  it('works after the project is connected', async () => {
    const flag = defineFlag({ key: 'a' });
    await expect(flag()).rejects.toThrow();

    vi.stubEnv('VERCEL_OIDC_TOKEN', 'oidc-token-1');
    vi.stubGlobal('fetch', ofrepServer(true));
    await expect(flag()).resolves.toBe(true);
  });

  describe('in production', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('VERCEL_OIDC_TOKEN', 'oidc-token-1');
      vi.stubGlobal('fetch', ofrepServer(true));
    });

    it('logs one warning that OFREP is slow', async () => {
      const flag = defineFlag({ key: 'a' });
      await flag();
      await flag();

      expect(warnings).toEqual([
        'flags: Flags without a connection use OFREP, which sends one request for each evaluation. For production, set a default connection in flags.config.ts, e.g. with VercelProvider of @vercel/flags-core/openfeature.',
      ]);
    });

    it('logs no warning with a configured default connection', async () => {
      runtime.configure({ defaultConnection: connectionOf(true) });
      await defineFlag({ key: 'a' })();

      expect(warnings).toEqual([]);
    });
  });
});

describe('configured default connection', () => {
  it('replaces the built-in default connection', async () => {
    const connection = connectionOf(true);
    runtime.configure(defineConfig({ defaultConnection: connection }));
    const flag = defineFlag({ key: 'a' });

    expect(flag.connection).toBe(connection);
    await expect(flag()).resolves.toBe(true);
    expect(connection.provider.resolveBooleanEvaluation).toHaveBeenCalled();
  });

  it('applies to flags which are defined before the configuration', async () => {
    const flag = defineFlag({ key: 'a' });
    const connection = connectionOf(true);

    runtime.configure({ defaultConnection: connection });
    expect(flag.connection).toBe(connection);
    await expect(flag()).resolves.toBe(true);
  });

  it('applies to plain definitions without a connection', async () => {
    runtime.configure({ defaultConnection: connectionOf(true) });

    await expect(evaluate({ key: 'dynamic' })).resolves.toBe(true);
  });

  it('does not change flags with their own connection', async () => {
    runtime.configure({ defaultConnection: connectionOf(true) });
    const own = connectionOf(false, 'own');
    const flag = defineFlag({ key: 'a', connection: own });

    expect(flag.connection).toBe(own);
    await expect(flag()).resolves.toBe(false);
  });

  it('is replaced by the next call of configure', async () => {
    runtime.configure({ defaultConnection: connectionOf(true) });
    const flag = defineFlag({ key: 'a' });
    await expect(flag()).resolves.toBe(true);

    runtime.configure({ defaultConnection: connectionOf(false) });
    await expect(flag()).resolves.toBe(false);
  });

  it('works with any OpenFeature provider', async () => {
    runtime.configure({
      defaultConnection: defineConnection({
        provider: new TypedInMemoryProvider({
          'summer-sale': {
            variants: { on: true, off: false },
            defaultVariant: 'on',
            disabled: false,
          },
        } as const),
        project: { platform: 'in-memory' },
      }),
    });

    await expect(defineFlag({ key: 'summer-sale' })()).resolves.toBe(true);
  });

  it('only accepts a connection returned by defineConnection', () => {
    const fake = {
      provider: connectionOf(true).provider,
      project: { platform: 'in-memory' as const },
    };

    expect(() => runtime.configure({ defaultConnection: fake })).toThrow(
      'flags: The defaultConnection of the configuration must be returned by defineConnection.',
    );
  });

  describe('initialization', () => {
    it('initializes the configured default connection in onInit', async () => {
      const connection = connectionOf(true);
      defineFlag({ key: 'a' });
      runtime.configure({ defaultConnection: connection });

      await runtime.onInit();
      expect(connection.provider.initialize).toHaveBeenCalledTimes(1);
    });

    it('initializes a configured default connection also before a flag uses it', async () => {
      const connection = connectionOf(true);
      runtime.configure({ defaultConnection: connection });

      await runtime.onInit();
      expect(connection.provider.initialize).toHaveBeenCalledTimes(1);
    });
  });
});

describe('configure', () => {
  it('validates all options before it changes anything', async () => {
    const connection = connectionOf(true);
    runtime.configure({ defaultConnection: connection });

    expect(() =>
      runtime.configure({
        defaultConnection: connectionOf(false),
        overrides: { secret: 'not-valid' },
      }),
    ).toThrow('flags: Invalid FLAGS_SECRET.');
    await expect(defineFlag({ key: 'a' })()).resolves.toBe(true);
  });
});
