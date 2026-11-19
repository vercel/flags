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
import {
  createVercelOfrepProvider,
  resetProductionWarning,
  VERCEL_OFREP_BASE_URL,
} from './default-provider';
import { type DefaultSource, getBuiltInSource } from './default-source';
import { evaluate, type FlagEvaluationContext } from './evaluate';
import { bindFlag } from './flag';
import { runtime } from './runtime';
import { type DefaultSourceInput, defineSource } from './source';
import type { Provider } from './types';

function ofrepServer(value: boolean) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    Response.json({ key: 'a', value, reason: 'STATIC' }),
  );
}

function sourceOf(value: boolean, name = 'app') {
  const provider = {
    metadata: { name },
    initialize: vi.fn(async () => {}),
    resolveBooleanEvaluation: vi.fn(async () => ({ value })),
  } satisfies Provider;
  return defineSource({ provider, project: { system: 'in-memory' } });
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

describe('built-in default source', () => {
  it('is the source of a flag without a source', () => {
    const flag = bindFlag({ key: 'a' });

    expect(flag.source).toBe(getBuiltInSource());
    expect(flag.source.project).toEqual({ system: 'vercel-flags' });
    expectTypeOf(flag.source).toEqualTypeOf<DefaultSource>();
  });

  it('accepts any evaluation context', () => {
    const flag = bindFlag({ key: 'a' });
    expectTypeOf<
      FlagEvaluationContext<typeof flag>
    >().toEqualTypeOf<DefaultSourceInput>();

    void (() => {
      flag();
      flag({ evaluationContext: { user: 'alice' } });
    });
  });

  it('is the same for each copy of the package', async () => {
    vi.resetModules();
    const copy: typeof import('./index') = await import('./index');

    expect(copy.bindFlag({ key: 'a' }).source).toBe(
      bindFlag({ key: 'a' }).source,
    );
  });

  it('throws for now, and tells what to do', async () => {
    await expect(bindFlag({ key: 'a' })()).rejects.toMatchObject({
      name: 'FlagEvaluationError',
      message:
        'flags: Could not evaluate flag "a": A flag without a source uses the default source, which is not available yet. Pass a source to bindFlag, or set defaultSource in flags.config.ts.',
    });
  });

  it('returns the default value of a flag', async () => {
    await expect(bindFlag({ key: 'a', defaultValue: false })()).resolves.toBe(
      false,
    );
  });
});

// The OFREP provider of Vercel Flags. The built-in default source does not
// use it for now, but it stays for later.
describe('createVercelOfrepProvider', () => {
  const ofrepFlag = () => {
    runtime.configure({
      defaultSource: defineSource({
        provider: createVercelOfrepProvider(),
        project: { system: 'vercel-flags' },
      }),
    });
    return bindFlag({ key: 'a' });
  };

  it('uses OFREP with the OIDC token of vercel env pull', async () => {
    vi.stubEnv('VERCEL_OIDC_TOKEN', 'oidc-token-1');
    const fetch = ofrepServer(true);
    vi.stubGlobal('fetch', fetch);

    await expect(
      ofrepFlag()({ evaluationContext: { user: 'alice' } }),
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
    const flag = ofrepFlag();

    await flag();
    vi.stubEnv('VERCEL_OIDC_TOKEN', 'oidc-token-2');
    await flag();

    expect(fetch.mock.calls[1]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer oidc-token-2',
    });
  });

  it('throws when the project is not connected to Vercel', async () => {
    await expect(ofrepFlag()()).rejects.toMatchObject({
      name: 'FlagEvaluationError',
      message:
        'flags: Could not evaluate flag "a": A flag without a source uses Vercel Flags, but the project is not connected to Vercel. Run `vercel link` and `vercel env pull`, set a default source in flags.config.ts, or pass a source to bindFlag.',
    });
  });

  it('works after the project is connected', async () => {
    const flag = ofrepFlag();
    await expect(flag()).rejects.toThrow();

    vi.stubEnv('VERCEL_OIDC_TOKEN', 'oidc-token-1');
    vi.stubGlobal('fetch', ofrepServer(true));
    await expect(flag()).resolves.toBe(true);
  });

  it('logs one warning in production that OFREP is slow', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_OIDC_TOKEN', 'oidc-token-1');
    vi.stubGlobal('fetch', ofrepServer(true));
    const flag = ofrepFlag();
    await flag();
    await flag();

    expect(warnings).toEqual([
      'flags: Flags without a source use OFREP, which sends one request for each evaluation. For production, set a default source in flags.config.ts, e.g. with VercelProvider of @vercel/flags-core/openfeature.',
    ]);
  });
});

describe('configured default source', () => {
  it('replaces the built-in default source', async () => {
    const source = sourceOf(true);
    runtime.configure(defineConfig({ defaultSource: source }));
    const flag = bindFlag({ key: 'a' });

    expect(flag.source).toBe(source);
    await expect(flag()).resolves.toBe(true);
    expect(source.provider.resolveBooleanEvaluation).toHaveBeenCalled();
  });

  it('applies to flags which are defined before the configuration', async () => {
    const flag = bindFlag({ key: 'a' });
    const source = sourceOf(true);

    runtime.configure({ defaultSource: source });
    expect(flag.source).toBe(source);
    await expect(flag()).resolves.toBe(true);
  });

  it('applies to plain definitions without a source', async () => {
    runtime.configure({ defaultSource: sourceOf(true) });

    await expect(evaluate({ key: 'dynamic' })).resolves.toBe(true);
  });

  it('does not change flags with their own source', async () => {
    runtime.configure({ defaultSource: sourceOf(true) });
    const own = sourceOf(false, 'own');
    const flag = bindFlag({ key: 'a', source: own });

    expect(flag.source).toBe(own);
    await expect(flag()).resolves.toBe(false);
  });

  it('is replaced by the next call of configure', async () => {
    runtime.configure({ defaultSource: sourceOf(true) });
    const flag = bindFlag({ key: 'a' });
    await expect(flag()).resolves.toBe(true);

    runtime.configure({ defaultSource: sourceOf(false) });
    await expect(flag()).resolves.toBe(false);
  });

  it('works with any OpenFeature provider', async () => {
    runtime.configure({
      defaultSource: defineSource({
        provider: new TypedInMemoryProvider({
          'summer-sale': {
            variants: { on: true, off: false },
            defaultVariant: 'on',
            disabled: false,
          },
        } as const),
        project: { system: 'in-memory' },
      }),
    });

    await expect(bindFlag({ key: 'summer-sale' })()).resolves.toBe(true);
  });

  it('only accepts a source returned by defineSource', () => {
    const fake = {
      provider: sourceOf(true).provider,
      project: { system: 'in-memory' as const },
    };

    expect(() => runtime.configure({ defaultSource: fake })).toThrow(
      'flags: The defaultSource of the configuration must be returned by defineSource.',
    );
  });

  describe('initialization', () => {
    it('initializes the configured default source in onInit', async () => {
      const source = sourceOf(true);
      bindFlag({ key: 'a' });
      runtime.configure({ defaultSource: source });

      await runtime.onInit();
      expect(source.provider.initialize).toHaveBeenCalledTimes(1);
    });

    it('initializes a configured default source also before a flag uses it', async () => {
      const source = sourceOf(true);
      runtime.configure({ defaultSource: source });

      await runtime.onInit();
      expect(source.provider.initialize).toHaveBeenCalledTimes(1);
    });
  });
});

describe('a replaced default source', () => {
  it('is not initialized after it is replaced', async () => {
    const first = sourceOf(true, 'first');
    const second = sourceOf(true, 'second');
    runtime.configure({ defaultSource: first });
    runtime.configure({ defaultSource: second });

    await runtime.onInit();
    expect(first.provider.initialize).not.toHaveBeenCalled();
    expect(second.provider.initialize).toHaveBeenCalledTimes(1);
  });

  it('is closed when it was initialized', async () => {
    const first = sourceOf(true, 'first');
    const onClose = vi.fn(async () => {});
    Object.assign(first.provider, { onClose });
    runtime.configure({ defaultSource: first });
    await runtime.onInit();

    runtime.configure({ defaultSource: sourceOf(true, 'second') });
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('is not closed when a flag still uses its provider', async () => {
    const shared = sourceOf(true, 'shared');
    const onClose = vi.fn(async () => {});
    Object.assign(shared.provider, { onClose });
    bindFlag({ key: 'own', source: shared });
    runtime.configure({ defaultSource: shared });
    await runtime.onInit();

    runtime.configure({ defaultSource: sourceOf(true, 'second') });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('configure', () => {
  it('validates all options before it changes anything', async () => {
    const source = sourceOf(true);
    runtime.configure({ defaultSource: source });

    expect(() =>
      runtime.configure({
        defaultSource: sourceOf(false),
        overrides: { secret: 'not-valid' },
      }),
    ).toThrow('flags: Invalid FLAGS_SECRET.');
    await expect(bindFlag({ key: 'a' })()).resolves.toBe(true);
  });
});
