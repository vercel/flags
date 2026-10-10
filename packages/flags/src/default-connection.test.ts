import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import type { DefaultConnectionInput } from './connection';
import {
  type DefaultConnection,
  getDefaultConnection,
  modules,
  VERCEL_OFREP_BASE_URL,
} from './default-connection';
import type { FlagEvaluationContext } from './evaluate';
import { defineFlag } from './flag';
import { runtime } from './runtime';

type FlagsCore = Awaited<ReturnType<typeof modules.loadFlagsCore>>;

const loadRealFlagsCore = modules.loadFlagsCore;

/**
 * The error of Node.js for a package which is not installed.
 */
function notInstalled() {
  return Object.assign(new Error("Cannot find package '@vercel/flags-core'"), {
    code: 'ERR_MODULE_NOT_FOUND',
  });
}

/**
 * A fake of `@vercel/flags-core`, as if the build had installed it.
 */
function installFlagsCore(
  evaluate: (key: string) => Record<string, unknown> = () => ({
    value: true,
    reason: 'rule_match',
    variantId: 'on',
  }),
) {
  const client = {
    initialize: vi.fn(async () => {}),
    shutdown: vi.fn(async () => {}),
    evaluate: vi.fn(async (key: string) => evaluate(key)),
  };
  modules.loadFlagsCore = async () =>
    ({ flagsClient: client }) as unknown as FlagsCore;
  return client;
}

function ofrepServer(value: boolean) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    Response.json({ key: 'a', value, reason: 'STATIC' }),
  );
}

beforeEach(() => {
  runtime.reset();
  vi.stubEnv('VERCEL_OIDC_TOKEN', '');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // By default, the package is not installed
  modules.loadFlagsCore = async () => {
    throw notInstalled();
  };
});

afterEach(async () => {
  // The default connection keeps its selection, so close it for the next test
  await getDefaultConnection().provider.onClose?.();
  modules.loadFlagsCore = loadRealFlagsCore;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('default connection', () => {
  it('is the connection of a flag without a connection', () => {
    const flag = defineFlag({ key: 'a' });

    expect(flag.connection).toBe(getDefaultConnection());
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

  describe('with @vercel/flags-core', () => {
    it('loads the real package of the workspace', async () => {
      const core = await loadRealFlagsCore();
      expect(typeof core.flagsClient.evaluate).toBe('function');
    });

    it('uses it when it is installed, also with an OIDC token', async () => {
      const client = installFlagsCore();
      vi.stubEnv('VERCEL_OIDC_TOKEN', 'also-set');
      const fetch = ofrepServer(false);
      vi.stubGlobal('fetch', fetch);

      await expect(
        defineFlag({ key: 'a' })({ evaluationContext: { user: 'alice' } }),
      ).resolves.toBe(true);
      expect(client.evaluate).toHaveBeenCalledWith('a', false, {
        user: 'alice',
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('initializes and shuts down the client', async () => {
      const client = installFlagsCore();
      defineFlag({ key: 'a' });

      await runtime.onInit();
      await runtime.onShutdown();
      expect(client.initialize).toHaveBeenCalledTimes(1);
      expect(client.shutdown).toHaveBeenCalledTimes(1);
    });

    it('returns the default value when the client reports an error', async () => {
      installFlagsCore(() => ({
        reason: 'error',
        errorCode: 'FLAG_NOT_FOUND',
        errorMessage: 'Unknown flag',
        variantId: null,
      }));

      await expect(
        defineFlag({ key: 'a', defaultValue: true })(),
      ).resolves.toBe(true);
      await expect(defineFlag({ key: 'b' })()).rejects.toMatchObject({
        code: 'FLAG_NOT_FOUND',
        message: 'flags: Could not evaluate flag "b": Unknown flag',
      });
    });

    it('throws other errors of the package', async () => {
      modules.loadFlagsCore = async () => {
        throw new Error('Invalid configuration of FLAGS');
      };

      await expect(defineFlag({ key: 'a' })()).rejects.toThrow(
        'Invalid configuration of FLAGS',
      );
    });

    it.each([
      ['Node.js ESM', { code: 'ERR_MODULE_NOT_FOUND' }],
      ['Node.js CommonJS', { code: 'MODULE_NOT_FOUND' }],
      ['Turbopack', { message: "Cannot find module '@vercel/flags-core'" }],
    ])('treats the error of %s as not installed', async (_name, error) => {
      vi.stubEnv('VERCEL_OIDC_TOKEN', 'oidc-token-1');
      vi.stubGlobal('fetch', ofrepServer(true));
      modules.loadFlagsCore = async () => {
        throw Object.assign(
          new Error('message' in error ? error.message : 'not found'),
          error,
        );
      };

      await expect(defineFlag({ key: 'a' })()).resolves.toBe(true);
    });
  });

  describe('without @vercel/flags-core', () => {
    it('uses OFREP with the OIDC token locally', async () => {
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
          'flags: Could not evaluate flag "a": A flag without a connection uses Vercel Flags, but the project is not connected to Vercel. Run `vercel link` and `vercel env pull`, or pass a connection to defineFlag.',
      });
    });

    it('returns the default value when the project is not connected', async () => {
      await expect(
        defineFlag({ key: 'a', defaultValue: true })(),
      ).resolves.toBe(true);
    });

    it('tries again after the project is connected', async () => {
      const flag = defineFlag({ key: 'a' });
      await expect(flag()).rejects.toThrow();

      vi.stubEnv('VERCEL_OIDC_TOKEN', 'oidc-token-1');
      vi.stubGlobal('fetch', ofrepServer(true));
      await expect(flag()).resolves.toBe(true);
    });
  });
});
