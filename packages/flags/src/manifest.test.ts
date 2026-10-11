import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineConnection } from './connection';
import { defineFlag } from './flag';
import { createManifest } from './manifest';
import { registerFlags } from './register';
import { runtime } from './runtime';

const connection = () =>
  defineConnection({
    provider: {
      metadata: { name: 'test' },
      resolveBooleanEvaluation: async () => ({ value: true }),
    },
    project: { platform: 'in-memory' },
  });

beforeEach(() => {
  runtime.reset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // The project of Vercel Flags, as in a build on Vercel
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_shop');
  vi.stubEnv('VERCEL_TARGET_ENV', 'production');
  vi.stubEnv('VERCEL_OIDC_TOKEN', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const vercel = {
  platform: 'vercel',
  providerManifest: 'https://flags-sdk.dev/provider-manifests/vercel.json',
  variables: { projectId: 'prj_shop', environment: 'production' },
};

describe('createManifest', () => {
  it('reads the flags from the exports of the modules', () => {
    const manifest = createManifest([
      {
        id: 'flags.ts',
        exports: {
          summerSale: defineFlag('summer-sale'),
          checkout: defineFlag({
            key: 'checkout',
            type: 'string',
            options: ['control', { value: 'express', label: 'Express' }],
            defaultValue: 'control',
            description: 'The checkout flow',
          }),
        },
      },
    ]);

    expect(manifest).toEqual({
      version: 1,
      // Without a connection, the flags use the default connection
      connections: { vercel },
      definitions: {
        checkout: {
          type: 'string',
          options: [
            { value: 'control' },
            { value: 'express', label: 'Express' },
          ],
          defaultValue: 'control',
          description: 'The checkout flow',
          declaredInCode: true,
          connection: 'vercel',
          sources: [{ module: 'flags.ts', export: 'checkout' }],
        },
        'summer-sale': {
          type: 'boolean',
          declaredInCode: true,
          connection: 'vercel',
          sources: [{ module: 'flags.ts', export: 'summerSale' }],
        },
      },
    });
  });

  it('accepts any object with a key, not only flags of defineFlag', () => {
    const manifest = createManifest([
      {
        id: 'other.ts',
        exports: {
          theme: { key: 'theme', type: 'string', options: ['light', 'dark'] },
        },
      },
    ]);

    expect(manifest.definitions.theme).toEqual({
      type: 'string',
      options: [{ value: 'light' }, { value: 'dark' }],
      declaredInCode: true,
      connection: 'vercel',
      sources: [{ module: 'other.ts', export: 'theme' }],
    });
  });

  it('gives each connection its platform and the variables of its project', () => {
    const launchdarkly = (projectId: string) =>
      defineConnection({
        provider: {
          metadata: { name: 'ld' },
          resolveBooleanEvaluation: async () => ({ value: true }),
        },
        project: { platform: 'launchdarkly', projectId, teamId: 'acme' },
      });
    const manifest = createManifest([
      {
        id: 'flags.ts',
        exports: {
          a: defineFlag(launchdarkly('shop'), 'a'),
          b: defineFlag(launchdarkly('shop'), 'b'),
          c: defineFlag(launchdarkly('blog'), 'c'),
          d: defineFlag(connection(), 'd'),
        },
      },
    ]);

    // Two connection objects with the same project are one connection
    expect(manifest.connections).toEqual({
      launchdarkly: {
        platform: 'launchdarkly',
        providerManifest:
          'https://flags-sdk.dev/provider-manifests/launchdarkly.json',
        variables: { projectId: 'shop', teamId: 'acme' },
      },
      'launchdarkly-2': {
        platform: 'launchdarkly',
        providerManifest:
          'https://flags-sdk.dev/provider-manifests/launchdarkly.json',
        variables: { projectId: 'blog', teamId: 'acme' },
      },
      // No provider manifest for in-memory
      'in-memory': { platform: 'in-memory', variables: {} },
    });
    expect(manifest.definitions.a?.connection).toBe('launchdarkly');
    expect(manifest.definitions.b?.connection).toBe('launchdarkly');
    expect(manifest.definitions.c?.connection).toBe('launchdarkly-2');
    expect(manifest.definitions.d?.connection).toBe('in-memory');
  });

  it('uses the provider manifest of the project instead of the one of the platform', () => {
    const own = defineConnection({
      provider: {
        metadata: { name: 'own' },
        resolveBooleanEvaluation: async () => ({ value: true }),
      },
      project: {
        platform: 'in-memory',
        providerManifest: 'https://flags.example/provider.json',
      },
    });

    const manifest = createManifest([
      { id: 'flags.ts', exports: { a: defineFlag(own, 'a') } },
    ]);
    expect(manifest.connections['in-memory']).toEqual({
      platform: 'in-memory',
      providerManifest: 'https://flags.example/provider.json',
      variables: {},
    });
  });

  it('keeps all sources of a flag which two modules export', () => {
    const flag = defineFlag('summer-sale', false);
    const manifest = createManifest([
      { id: 'a.ts', exports: { summerSale: flag } },
      { id: 'b.ts', exports: { sale: flag } },
    ]);

    expect(manifest.definitions['summer-sale']?.sources).toEqual([
      { module: 'a.ts', export: 'summerSale' },
      { module: 'b.ts', export: 'sale' },
    ]);
  });

  it('throws for two different flags with the same key', () => {
    expect(() =>
      createManifest([
        { id: 'a.ts', exports: { a: defineFlag('sale', false) } },
        { id: 'b.ts', exports: { b: defineFlag('sale', true) } },
      ]),
    ).toThrow(
      'flags: Flag "sale" is declared two times with different values: export "a" of a.ts, and export "b" of b.ts.',
    );
  });

  it('throws for an export which is not a flag', () => {
    expect(() =>
      createManifest([{ id: 'flags.ts', exports: { helper: () => true } }]),
    ).toThrow(
      `flags: Export "helper" of flags.ts is not a flag. A module with 'use flags' exports only flags.`,
    );
  });

  it('throws for values which do not fit the type', () => {
    expect(() =>
      createManifest([
        { id: 'f.ts', exports: { a: { key: 'a', type: 'date' } } },
      ]),
    ).toThrow('which is not boolean, string, number or object');
    expect(() =>
      createManifest([
        {
          id: 'f.ts',
          exports: { a: { key: 'a', type: 'number', defaultValue: 'x' } },
        },
      ]),
    ).toThrow(
      'flags: The defaultValue of flag "a" (export "a" of f.ts) is the string "x", not a number.',
    );
  });

  it('is JSON', () => {
    const manifest = createManifest([
      { id: 'flags.ts', exports: { a: defineFlag('a', { color: 'blue' }) } },
    ]);

    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
  });
});

describe('registerFlags', () => {
  it('registers the connections of the exported flags', () => {
    const c = connection();
    registerFlags({ a: { key: 'a', connection: c } });

    expect(runtime.connections.has(c)).toBe(true);
  });

  it('does not register the default connection of a flag without one', () => {
    registerFlags({ a: defineFlag('a') });

    expect(runtime.connections.size).toBe(0);
  });

  it('throws for an export which is not a flag, and registers nothing', () => {
    const c = connection();
    expect(() =>
      registerFlags({ a: { key: 'a', connection: c }, helper: 1 }),
    ).toThrow(
      'flags: registerFlags expects only flags, but export "helper" is not a flag.',
    );
    expect(runtime.connections.has(c)).toBe(false);
  });
});
