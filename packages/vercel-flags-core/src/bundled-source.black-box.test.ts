import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BundledDefinitions,
  createClient,
  type FlagsClient,
} from './index.default';
import { setRequestContext } from './test-utils';
import type { BundledDefinitionsResult } from './types';
import { readBundledDefinitions } from './utils/read-bundled-definitions';

// Keep the client and source real; replace only the optional filesystem module.
vi.mock('./utils/read-bundled-definitions', () => ({
  readBundledDefinitions: vi.fn(),
}));

const SDK_KEY = 'vf_server_private_bundle_key';
const clients = new Set<FlagsClient>();
let cleanupContext = () => {};

function definitions(): BundledDefinitions {
  return {
    projectId: 'prj_bundle',
    environment: 'production',
    configUpdatedAt: 1_700_000_000_000,
    revision: 42,
    digest: 'private-bundle-digest',
    definitions: {
      'private-flag-key': {
        environments: { production: 0 },
        variants: ['private-flag-value'],
      },
    },
  };
}

function client() {
  const instance = createClient(SDK_KEY, {
    stream: false,
    polling: false,
    buildStep: false,
    fetch: vi.fn<typeof fetch>().mockImplementation((input) => {
      if (String(input) === 'https://flags.vercel.com/v1/ingest') {
        return Promise.resolve(new Response());
      }
      return Promise.reject(new Error('Unexpected network request'));
    }),
  });
  clients.add(instance);
  return instance;
}

function expectLog(message: string, details: Record<string, unknown> = {}) {
  expect(console.log).toHaveBeenCalledWith(
    `@vercel/flags-core [bundled-source] ${message}`,
    expect.objectContaining(details),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('DEBUG', '@vercel/flags-core');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.mocked(readBundledDefinitions).mockReset();
  vi.mocked(readBundledDefinitions).mockResolvedValue({
    state: 'ok',
    definitions: definitions(),
  });
  cleanupContext = setRequestContext({});
});

afterEach(async () => {
  try {
    await Promise.all([...clients].map((instance) => instance.shutdown()));
  } finally {
    clients.clear();
    cleanupContext();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  }
});

describe('bundled-source diagnostics (black-box)', () => {
  it('logs loaded metadata and the bundle actually used for evaluation', async () => {
    const instance = client();
    const result = await instance.evaluate('private-flag-key');
    expect(result.value).toBe('private-flag-value');
    expect(result.metrics?.source).toBe('embedded');
    expectLog('Loading bundled definitions');
    expectLog('Bundled definitions loaded', {
      projectId: 'prj_bundle',
      environment: 'production',
      configUpdatedAt: 1_700_000_000_000,
      revision: 42,
    });
    expect(console.log).toHaveBeenCalledWith(
      '@vercel/flags-core [controller] Read resolved',
      expect.objectContaining({ origin: 'bundled', source: 'embedded' }),
    );
    await instance.getFallbackDatafile();
    expectLog('Reusing cached or pending lookup');
    expect(readBundledDefinitions).toHaveBeenCalledTimes(1);

    const output = JSON.stringify(vi.mocked(console.log).mock.calls);
    for (const secret of [
      SDK_KEY,
      'private-flag-key',
      'private-flag-value',
      'private-bundle-digest',
    ]) {
      expect(output).not.toContain(secret);
    }
  });

  it('shares a pending lookup without logging another load attempt', async () => {
    let resolve!: (value: BundledDefinitionsResult) => void;
    vi.mocked(readBundledDefinitions).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const instance = client();
    const first = instance.getFallbackDatafile();
    const second = instance.getFallbackDatafile();
    expectLog('Reusing cached or pending lookup');
    expect(readBundledDefinitions).toHaveBeenCalledTimes(1);
    const bundled = definitions();
    resolve({ state: 'ok', definitions: bundled });
    await expect(Promise.all([first, second])).resolves.toEqual([
      bundled,
      bundled,
    ]);
    const loadLogs = vi
      .mocked(console.log)
      .mock.calls.filter(
        ([message]) =>
          message ===
          '@vercel/flags-core [bundled-source] Loading bundled definitions',
      );
    expect(loadLogs).toHaveLength(1);
    expectLog('Bundled definitions loaded');
  });

  it.each([
    ['missing-file', 'FallbackNotFoundError'],
    ['missing-entry', 'FallbackEntryNotFoundError'],
  ] as const)('reports %s while preserving the public error and cached result', async (state, name) => {
    vi.mocked(readBundledDefinitions).mockResolvedValue({
      definitions: null,
      state,
    });
    const instance = client();
    await expect(instance.getFallbackDatafile()).rejects.toMatchObject({
      name,
    });
    expectLog('Bundled definitions unavailable', { reason: state });
    await expect(instance.getFallbackDatafile()).rejects.toMatchObject({
      name,
    });
    expectLog('Reusing cached or pending lookup');
    expect(readBundledDefinitions).toHaveBeenCalledTimes(1);
  });

  it('reports unexpected errors without exposing the error payload', async () => {
    const error = new Error(`private-error-details ${SDK_KEY}`);
    vi.mocked(readBundledDefinitions).mockResolvedValue({
      definitions: null,
      state: 'unexpected-error',
      error,
    });
    await expect(client().getFallbackDatafile()).rejects.toThrow(error.message);
    expectLog('Bundled definitions unavailable', {
      reason: 'unexpected-error',
    });
    const output = JSON.stringify(vi.mocked(console.log).mock.calls);
    expect(output).not.toContain('private-error-details');
    expect(output).not.toContain(SDK_KEY);
  });

  it('logs a rejected lookup without changing its error or caching behavior', async () => {
    const error = new Error(`private-rejection ${SDK_KEY}`);
    vi.mocked(readBundledDefinitions).mockRejectedValue(error);
    const instance = client();
    await expect(instance.getFallbackDatafile()).rejects.toBe(error);
    expectLog('Bundled definitions lookup failed');
    await expect(instance.getFallbackDatafile()).rejects.toBe(error);
    expect(readBundledDefinitions).toHaveBeenCalledTimes(1);
    const output = JSON.stringify(vi.mocked(console.log).mock.calls);
    expect(output).not.toContain('private-rejection');
    expect(output).not.toContain(SDK_KEY);
  });

  it.each([
    undefined,
    '',
    'other-package',
  ])('stays silent when DEBUG is %s', async (value) => {
    vi.stubEnv('DEBUG', value);
    const instance = client();
    await instance.getFallbackDatafile();
    await instance.getFallbackDatafile();
    await instance.shutdown();
    clients.delete(instance);
    expect(console.log).not.toHaveBeenCalled();
  });

  it('can disable diagnostics after a bundle is cached', async () => {
    const instance = client();
    await instance.getFallbackDatafile();
    expectLog('Bundled definitions loaded');
    vi.mocked(console.log).mockClear();
    vi.stubEnv('DEBUG', undefined);
    await instance.getFallbackDatafile();
    expect(console.log).not.toHaveBeenCalled();
    expect(readBundledDefinitions).toHaveBeenCalledTimes(1);
  });
});
