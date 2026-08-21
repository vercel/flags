import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { version as pkgVersion } from '../package.json';
import {
  generateDefinitionsModule,
  getProjectIdFromOidcToken,
  hashSdkKey,
  prepareFlagsDefinitions,
} from './index';

function createOidcToken(projectId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString(
    'base64url',
  );
  const payload = Buffer.from(
    JSON.stringify({ project_id: projectId, exp: 4_102_444_800 }),
  ).toString('base64url');
  return `${header}.${payload}.signature`;
}

describe('hashSdkKey', () => {
  it('returns a SHA-256 hex digest', () => {
    const hash = hashSdkKey('vf_server_test_key');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns the same hash for the same input', () => {
    expect(hashSdkKey('vf_server_abc')).toBe(hashSdkKey('vf_server_abc'));
  });

  it('returns different hashes for different inputs', () => {
    expect(hashSdkKey('vf_server_abc')).not.toBe(hashSdkKey('vf_client_xyz'));
  });
});

describe('getProjectIdFromOidcToken', () => {
  it('reads the project_id claim', () => {
    expect(getProjectIdFromOidcToken(createOidcToken('prj_test'))).toBe(
      'prj_test',
    );
  });
});

describe('generateDefinitionsModule', () => {
  it('generates a valid JS module', () => {
    const result = generateDefinitionsModule(
      [{ key: 'vf_server_key1', definitions: { flag_a: { value: true } } }],
      undefined,
    );

    expect(result).toContain('const memo');
    expect(result).toContain('export function get(key)');
    expect(result).toContain('export const version');
    expect(result).toContain('vf_server_key1');
  });

  it('deduplicates identical definitions', () => {
    const sharedDef = { flag_a: { value: true } };
    const result = generateDefinitionsModule(
      [
        { key: 'vf_server_key1', definitions: sharedDef },
        { key: 'vf_client_key2', definitions: sharedDef },
      ],
      undefined,
    );

    const memoMatches = result.match(/const _d\d+ = memo/g);
    expect(memoMatches).toHaveLength(1);
  });

  it('keeps separate definitions when values differ', () => {
    const result = generateDefinitionsModule(
      [
        { key: 'vf_server_key1', definitions: { flag_a: { value: true } } },
        { key: 'vf_client_key2', definitions: { flag_b: { value: false } } },
      ],
      undefined,
    );

    const memoMatches = result.match(/const _d\d+ = memo/g);
    expect(memoMatches).toHaveLength(2);
  });

  it('maps each SDK key hash to the correct definition index', () => {
    const result = generateDefinitionsModule(
      [
        { key: 'vf_server_key1', definitions: { flag_a: true } },
        { key: 'vf_client_key2', definitions: { flag_b: false } },
      ],
      undefined,
    );

    expect(result).toContain(`${JSON.stringify('vf_server_key1')}: _d0`);
    expect(result).toContain(`${JSON.stringify('vf_client_key2')}: _d1`);
  });

  it('handles empty input', () => {
    const result = generateDefinitionsModule([], undefined);
    expect(result).toContain('const map = {');
    expect(result).toContain('export function get(key)');
  });

  it('deduplicates definitions across SDK keys and OIDC project IDs', () => {
    const sharedDef = { flag_a: { value: true } };
    const result = generateDefinitionsModule(
      [
        { key: 'vf_server_key1', definitions: sharedDef },
        { key: 'prj_test', definitions: sharedDef },
      ],
      undefined,
    );

    const memoMatches = result.match(/const _d\d+ = memo/g);
    expect(memoMatches).toHaveLength(1);
    expect(result).toContain(`${JSON.stringify('vf_server_key1')}: _d0`);
    expect(result).toContain(`${JSON.stringify('prj_test')}: _d0`);
  });
});

describe('prepareFlagsDefinitions', () => {
  it('returns { created: false, reason: "no-flags-entries" } when no flags auth is in env', async () => {
    const result = await prepareFlagsDefinitions({
      cwd: '/tmp/test',
      env: { SOME_VAR: 'hello' },
    });

    expect(result).toEqual({ created: false, reason: 'no-flags-entries' });
  });

  it('returns { created: true, entryCount: N } when definitions are created', async () => {
    const mockFetch = async () =>
      new Response(JSON.stringify({ flag_a: { value: true } }), {
        status: 200,
      });

    const cwd = '/tmp/test-definitions';
    const result = await prepareFlagsDefinitions({
      cwd,
      env: { FLAGS_SECRET: 'vf_server_test_key_123' },
      fetch: mockFetch,
    });

    expect(result).toEqual({ created: true, entryCount: 1 });
    const definitionsJs = await readFile(
      `${cwd}/node_modules/@vercel/flags-definitions/index.js`,
      'utf8',
    );
    expect(definitionsJs).toMatchInlineSnapshot(`
      "const memo = (fn) => { let cached; return () => (cached ??= fn()); };

      const _d0 = memo(() => JSON.parse("{\\"flag_a\\":{\\"value\\":true}}"));

      const map = {
        "faab116281fa4201059a73f3ca8b7cad7fce9e1132988008784883fa2c78d64a": _d0,
      };

      export function get(key) {
        return map[key]?.() ?? null;
      }

      export const version = "1.0.1";"
    `);
  });

  it('sends default user-agent with package version', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ flag_a: { value: true } }),
    });

    await prepareFlagsDefinitions({
      cwd: '/tmp/test-ua',
      env: { FLAGS_SECRET: 'vf_server_test_key' },
      fetch: mockFetch,
    });

    const headers = mockFetch.mock.calls[0]?.[1]?.headers;
    expect(headers['user-agent']).toBe(
      `@vercel/prepare-flags-definitions/${pkgVersion}`,
    );
  });

  it('appends userAgentSuffix to user-agent header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ flag_a: { value: true } }),
    });

    await prepareFlagsDefinitions({
      cwd: '/tmp/test-ua',
      env: { FLAGS_SECRET: 'vf_client_test_key' },
      userAgentSuffix: 'vercel-cli/35.0.0',
      fetch: mockFetch,
    });

    const headers = mockFetch.mock.calls[0]?.[1]?.headers;
    expect(headers['user-agent']).toBe(
      `@vercel/prepare-flags-definitions/${pkgVersion} vercel-cli/35.0.0`,
    );
  });

  it('ignores third-party identifiers that start with vf_ but are not SDK keys', async () => {
    const mockFetch = vi.fn();

    const result = await prepareFlagsDefinitions({
      cwd: '/tmp/test-third-party',
      env: {
        STRIPE_FLOW_ID: 'vf_1PyHgVLpWuMxVFxAbCdEfGhIjKlMn',
        STRIPE_LIVE_ID: 'vf_live_test_12345',
        OTHER_SERVICE: 'vf_something_else',
      },
      fetch: mockFetch,
    });

    expect(result).toEqual({ created: false, reason: 'no-flags-entries' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('extracts SDK keys from flags: connection string format', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ flag_a: { value: true } }),
    });

    const cwd = '/tmp/test-flags-format';
    const result = await prepareFlagsDefinitions({
      cwd,
      env: {
        FLAGS_CONNECTION: 'flags:sdkKey=vf_server_my_key&other=value',
      },
      fetch: mockFetch,
    });

    expect(result).toEqual({ created: true, entryCount: 1 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const headers = mockFetch.mock.calls[0]?.[1]?.headers;
    expect(headers.authorization).toBe('Bearer vf_server_my_key');
    const definitionsJs = await readFile(
      `${cwd}/node_modules/@vercel/flags-definitions/index.js`,
      'utf8',
    );
    expect(definitionsJs).toMatchInlineSnapshot(`
      "const memo = (fn) => { let cached; return () => (cached ??= fn()); };

      const _d0 = memo(() => JSON.parse("{\\"flag_a\\":{\\"value\\":true}}"));

      const map = {
        "3790790d2dc9b23c4539a9f3c49eb5820e4216daebdd7eeee9136f3ceccc31a3": _d0,
      };

      export function get(key) {
        return map[key]?.() ?? null;
      }

      export const version = "1.0.1";"
    `);
  });

  it('ignores invalid SDK keys in flags: connection string', async () => {
    const mockFetch = vi.fn();

    const result = await prepareFlagsDefinitions({
      cwd: '/tmp/test-invalid-flags',
      env: {
        FLAGS_CONNECTION: 'flags:sdkKey=vf_invalid_key&other=value',
      },
      fetch: mockFetch,
    });

    expect(result).toEqual({ created: false, reason: 'no-flags-entries' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('stores OIDC definitions under the token project_id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ flag_a: { value: true } }),
    });

    const cwd = '/tmp/test-oidc-definitions';
    const result = await prepareFlagsDefinitions({
      cwd,
      env: { VERCEL_OIDC_TOKEN: createOidcToken('prj_oidc_test') },
      fetch: mockFetch,
    });

    expect(result).toEqual({ created: true, entryCount: 1 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const headers = mockFetch.mock.calls[0]?.[1]?.headers;
    expect(headers.authorization).toBe(
      `Bearer ${createOidcToken('prj_oidc_test')}`,
    );

    const definitionsJs = await readFile(
      `${cwd}/node_modules/@vercel/flags-definitions/index.js`,
      'utf8',
    );
    expect(definitionsJs).toMatchInlineSnapshot(`
      "const memo = (fn) => { let cached; return () => (cached ??= fn()); };

      const _d0 = memo(() => JSON.parse("{\\"flag_a\\":{\\"value\\":true}}"));

      const map = {
        "prj_oidc_test": _d0,
      };

      export function get(key) {
        return map[key]?.() ?? null;
      }

      export const version = "1.0.1";"
    `);
  });

  it('stores OIDC definitions alongside SDK Keys', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ flag_a: { value: true } }),
    });

    const cwd = '/tmp/test-oidc-sdk-key-mix';
    const result = await prepareFlagsDefinitions({
      cwd,
      env: {
        VERCEL_OIDC_TOKEN: createOidcToken('prj_oidc_test'),
        FLAGS: 'vf_server_test_key_123',
      },
      fetch: mockFetch,
    });

    expect(result).toEqual({ created: true, entryCount: 2 });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const definitionsJs = await readFile(
      `${cwd}/node_modules/@vercel/flags-definitions/index.js`,
      'utf8',
    );
    expect(definitionsJs).toMatchInlineSnapshot(`
      "const memo = (fn) => { let cached; return () => (cached ??= fn()); };

      const _d0 = memo(() => JSON.parse("{\\"flag_a\\":{\\"value\\":true}}"));

      const map = {
        "faab116281fa4201059a73f3ca8b7cad7fce9e1132988008784883fa2c78d64a": _d0,
        "prj_oidc_test": _d0,
      };

      export function get(key) {
        return map[key]?.() ?? null;
      }

      export const version = "1.0.1";"
    `);
  });

  it('retries transient failures and succeeds', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'busy' })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ flag_a: { value: true } }),
      });

    const result = await prepareFlagsDefinitions({
      cwd: '/tmp/test-retry-success',
      env: { FLAGS_SECRET: 'vf_server_retry_key' },
      fetch: mockFetch,
    });

    expect(result).toEqual({ created: true, entryCount: 1 });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('gives up after exhausting retries on persistent failures', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, statusText: 'boom' });

    await expect(
      prepareFlagsDefinitions({
        cwd: '/tmp/test-retry-exhausted',
        env: { FLAGS_SECRET: 'vf_server_retry_key' },
        fetch: mockFetch,
      }),
    ).rejects.toThrow(/500 boom/);

    // 1 initial attempt + FETCH_MAX_RETRIES retries
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('does not retry non-retryable client errors', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'unauthorized',
    });

    await expect(
      prepareFlagsDefinitions({
        cwd: '/tmp/test-no-retry',
        env: { FLAGS_SECRET: 'vf_server_retry_key' },
        fetch: mockFetch,
      }),
    ).rejects.toThrow(/401 unauthorized/);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('stores OIDC definitions alongside SDK Keys with different datafiles', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ flag_a: { value: true } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ flag_b: { value: true } }),
      });

    const cwd = '/tmp/test-oidc-sdk-key-mix';
    const result = await prepareFlagsDefinitions({
      cwd,
      env: {
        VERCEL_OIDC_TOKEN: createOidcToken('prj_oidc_test'),
        FLAGS: 'vf_server_test_key_123',
      },
      fetch: mockFetch,
    });

    expect(result).toEqual({ created: true, entryCount: 2 });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const definitionsJs = await readFile(
      `${cwd}/node_modules/@vercel/flags-definitions/index.js`,
      'utf8',
    );
    expect(definitionsJs).toMatchInlineSnapshot(`
      "const memo = (fn) => { let cached; return () => (cached ??= fn()); };

      const _d0 = memo(() => JSON.parse("{\\"flag_a\\":{\\"value\\":true}}"));
      const _d1 = memo(() => JSON.parse("{\\"flag_b\\":{\\"value\\":true}}"));

      const map = {
        "faab116281fa4201059a73f3ca8b7cad7fce9e1132988008784883fa2c78d64a": _d0,
        "prj_oidc_test": _d1,
      };

      export function get(key) {
        return map[key]?.() ?? null;
      }

      export const version = "1.0.1";"
    `);
  });
});
