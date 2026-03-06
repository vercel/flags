import { describe, expect, it, vi } from 'vitest';
import { version as pkgVersion } from '../package.json';
import {
  generateDefinitionsModule,
  hashSdkKey,
  prepareFlagsDefinitions,
} from './index';

describe('hashSdkKey', () => {
  it('returns a SHA-256 hex digest', () => {
    const hash = hashSdkKey('vf_test_key');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns the same hash for the same input', () => {
    expect(hashSdkKey('vf_abc')).toBe(hashSdkKey('vf_abc'));
  });

  it('returns different hashes for different inputs', () => {
    expect(hashSdkKey('vf_abc')).not.toBe(hashSdkKey('vf_xyz'));
  });
});

describe('generateDefinitionsModule', () => {
  it('generates a valid JS module', () => {
    const sdkKeys = ['vf_key1'];
    const values = [{ flag_a: { value: true } }];
    const result = generateDefinitionsModule(sdkKeys, values);

    expect(result).toContain('const memo');
    expect(result).toContain('export function get(hashedSdkKey)');
    expect(result).toContain('export const version');
    expect(result).toContain(hashSdkKey('vf_key1'));
  });

  it('deduplicates identical definitions', () => {
    const sdkKeys = ['vf_key1', 'vf_key2'];
    const sharedDef = { flag_a: { value: true } };
    const values = [sharedDef, sharedDef];
    const result = generateDefinitionsModule(sdkKeys, values);

    const memoMatches = result.match(/const _d\d+ = memo/g);
    expect(memoMatches).toHaveLength(1);
  });

  it('keeps separate definitions when values differ', () => {
    const sdkKeys = ['vf_key1', 'vf_key2'];
    const values = [{ flag_a: { value: true } }, { flag_b: { value: false } }];
    const result = generateDefinitionsModule(sdkKeys, values);

    const memoMatches = result.match(/const _d\d+ = memo/g);
    expect(memoMatches).toHaveLength(2);
  });

  it('maps each SDK key hash to the correct definition index', () => {
    const sdkKeys = ['vf_key1', 'vf_key2'];
    const values = [{ flag_a: true }, { flag_b: false }];
    const result = generateDefinitionsModule(sdkKeys, values);

    expect(result).toContain(`${JSON.stringify(hashSdkKey('vf_key1'))}: _d0`);
    expect(result).toContain(`${JSON.stringify(hashSdkKey('vf_key2'))}: _d1`);
  });

  it('handles empty input', () => {
    const result = generateDefinitionsModule([], []);
    expect(result).toContain('const map = {');
    expect(result).toContain('export function get(hashedSdkKey)');
  });
});

describe('prepareFlagsDefinitions', () => {
  it('sends default user-agent with package version', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ flag_a: { value: true } }),
    });

    await prepareFlagsDefinitions({
      cwd: '/tmp/test-ua',
      env: { FLAGS_SECRET: 'vf_test_key' },
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
      env: { FLAGS_SECRET: 'vf_test_key' },
      userAgentSuffix: 'vercel-cli/35.0.0',
      fetch: mockFetch,
    });

    const headers = mockFetch.mock.calls[0]?.[1]?.headers;
    expect(headers['user-agent']).toBe(
      `@vercel/prepare-flags-definitions/${pkgVersion} vercel-cli/35.0.0`,
    );
  });
});
