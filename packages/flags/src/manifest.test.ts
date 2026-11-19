import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindFlag } from './flag';
import { createManifest, validateFlagsManifest } from './manifest';
import { registerFlags } from './register';
import { runtime } from './runtime';
import { defineSource } from './source';

const source = () =>
  defineSource({
    provider: {
      metadata: { name: 'test' },
      resolveBooleanEvaluation: async () => ({ value: true }),
    },
    project: { system: 'in-memory' },
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
  system: 'vercel-flags',
  systemManifest: 'https://flags-sdk.dev/system-manifests/vercel-flags.json',
  variables: { projectId: 'prj_shop', environment: 'production' },
};

describe('createManifest', () => {
  it('reads the flags from the exports of the modules', () => {
    const manifest = createManifest([
      {
        id: 'flags.ts',
        exports: {
          summerSale: bindFlag({ key: 'summer-sale' }),
          checkout: bindFlag({
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
      // Without a source, the flags use the default source
      sources: { 'vercel-flags': vercel },
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
          source: 'vercel-flags',
          declarations: [{ module: 'flags.ts', export: 'checkout' }],
        },
        'summer-sale': {
          type: 'boolean',
          declaredInCode: true,
          source: 'vercel-flags',
          declarations: [{ module: 'flags.ts', export: 'summerSale' }],
        },
      },
    });
  });

  it('accepts any object with a key, not only flags of bindFlag', () => {
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
      source: 'vercel-flags',
      declarations: [{ module: 'other.ts', export: 'theme' }],
    });
  });

  it('gives each source its system and the variables of its flag project', () => {
    const launchdarkly = (projectId: string) =>
      defineSource({
        provider: {
          metadata: { name: 'ld' },
          resolveBooleanEvaluation: async () => ({ value: true }),
        },
        project: { system: 'launchdarkly', projectId, teamId: 'acme' },
      });
    const manifest = createManifest([
      {
        id: 'flags.ts',
        exports: {
          a: bindFlag({ key: 'a', source: launchdarkly('shop') }),
          b: bindFlag({ key: 'b', source: launchdarkly('shop') }),
          c: bindFlag({ key: 'c', source: launchdarkly('blog') }),
          d: bindFlag({ key: 'd', source: source() }),
        },
      },
    ]);

    // Two source objects with the same project are one source
    expect(manifest.sources).toEqual({
      launchdarkly: {
        system: 'launchdarkly',
        systemManifest:
          'https://flags-sdk.dev/system-manifests/launchdarkly.json',
        variables: { projectId: 'shop', teamId: 'acme' },
      },
      'launchdarkly-2': {
        system: 'launchdarkly',
        systemManifest:
          'https://flags-sdk.dev/system-manifests/launchdarkly.json',
        variables: { projectId: 'blog', teamId: 'acme' },
      },
      // No system manifest for in-memory
      'in-memory': { system: 'in-memory', variables: {} },
    });
    expect(manifest.definitions.a?.source).toBe('launchdarkly');
    expect(manifest.definitions.b?.source).toBe('launchdarkly');
    expect(manifest.definitions.c?.source).toBe('launchdarkly-2');
    expect(manifest.definitions.d?.source).toBe('in-memory');
  });

  it('uses the fields of a vercel-flags project instead of the environment', () => {
    const other = defineSource({
      provider: {
        metadata: { name: 'vercel' },
        resolveBooleanEvaluation: async () => ({ value: true }),
      },
      // The flags of a different project, e.g. of a different team
      project: {
        system: 'vercel-flags',
        projectId: 'prj_blog',
        teamId: 'team_blog',
      },
    });

    const manifest = createManifest([
      { id: 'flags.ts', exports: { a: bindFlag({ key: 'a', source: other }) } },
    ]);
    expect(manifest.sources['vercel-flags']).toEqual({
      ...vercel,
      variables: {
        projectId: 'prj_blog',
        teamId: 'team_blog',
        environment: 'production',
      },
    });
  });

  it('uses the system manifest of the project instead of the one of the system', () => {
    const own = defineSource({
      provider: {
        metadata: { name: 'own' },
        resolveBooleanEvaluation: async () => ({ value: true }),
      },
      project: {
        system: 'in-memory',
        systemManifest: 'https://flags.example/provider.json',
      },
    });

    const manifest = createManifest([
      { id: 'flags.ts', exports: { a: bindFlag({ key: 'a', source: own }) } },
    ]);
    expect(manifest.sources['in-memory']).toEqual({
      system: 'in-memory',
      systemManifest: 'https://flags.example/provider.json',
      variables: {},
    });
  });

  it('keeps all declarations of a flag which two modules export', () => {
    const flag = bindFlag({ key: 'summer-sale', defaultValue: false });
    const manifest = createManifest([
      { id: 'a.ts', exports: { summerSale: flag } },
      { id: 'b.ts', exports: { sale: flag } },
    ]);

    expect(manifest.definitions['summer-sale']?.declarations).toEqual([
      { module: 'a.ts', export: 'summerSale' },
      { module: 'b.ts', export: 'sale' },
    ]);
  });

  it('throws for two different flags with the same key', () => {
    expect(() =>
      createManifest([
        {
          id: 'a.ts',
          exports: { a: bindFlag({ key: 'sale', defaultValue: false }) },
        },
        {
          id: 'b.ts',
          exports: { b: bindFlag({ key: 'sale', defaultValue: true }) },
        },
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
      {
        id: 'flags.ts',
        exports: {
          a: bindFlag({
            key: 'a',
            type: 'object',
            defaultValue: { color: 'blue' },
          }),
        },
      },
    ]);

    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
  });
});

describe('registerFlags', () => {
  it('registers the sources of the exported flags', () => {
    const c = source();
    registerFlags({ a: { key: 'a', source: c } });

    expect(runtime.sources.has(c)).toBe(true);
  });

  it('does not register the default connection of a flag without one', () => {
    registerFlags({ a: bindFlag({ key: 'a' }) });

    expect(runtime.sources.size).toBe(0);
  });

  it('throws for an export which is not a flag, and registers nothing', () => {
    const c = source();
    expect(() =>
      registerFlags({ a: { key: 'a', source: c }, helper: 1 }),
    ).toThrow(
      'flags: registerFlags expects only flags, but export "helper" is not a flag.',
    );
    expect(runtime.sources.has(c)).toBe(false);
  });
});

describe('validateFlagsManifest', () => {
  it('accepts a manifest of createManifest', () => {
    const manifest = createManifest([
      {
        id: 'flags.ts',
        exports: {
          a: bindFlag({ key: 'a', defaultValue: false }),
          b: bindFlag({ key: 'b', type: 'string', options: ['x', 'y'] }),
          c: bindFlag({ key: 'c', source: source() }),
        },
      },
    ]);

    expect(validateFlagsManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(
      manifest,
    );
  });

  it('allows fields which it does not know', () => {
    expect(() =>
      validateFlagsManifest({
        version: 1,
        sources: {},
        definitions: {},
        generator: 'a later version',
      }),
    ).not.toThrow();
  });

  it.each([
    [{ version: 2, sources: {}, definitions: {} }, 'the version is not 1'],
    [
      {
        version: 1,
        sources: {},
        definitions: {
          b: {
            type: 'boolean',
            declaredInCode: true,
            declarations: [{ module: 'f', export: 'b' }],
          },
          a: {
            type: 'boolean',
            declaredInCode: true,
            declarations: [{ module: 'f', export: 'a' }],
          },
        },
      },
      'not sorted by key',
    ],
    [
      {
        version: 1,
        sources: {},
        definitions: {
          a: {
            type: 'boolean',
            declaredInCode: true,
            source: 'missing',
            declarations: [{ module: 'f', export: 'a' }],
          },
        },
      },
      'a source which is not known',
    ],
    [
      {
        version: 1,
        sources: { x: { system: 'x', variables: { key: 1 } } },
        definitions: {},
      },
      'must be strings',
    ],
  ])('rejects %j', (manifest, message) => {
    expect(() => validateFlagsManifest(manifest)).toThrow(message);
  });
});
