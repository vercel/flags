import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { defineSource, isSource } from './source';

const myFlags = {
  v2_enabled: {
    variants: { on: true, off: false },
    disabled: false,
    defaultVariant: 'on',
  },
} as const;

describe('defineSource', () => {
  it('connects a provider to a project', () => {
    const provider = new TypedInMemoryProvider(myFlags);
    const source = defineSource({
      provider,
      project: { system: 'launchdarkly', projectId: 'x', teamId: 'y' },
    });

    expect(source.provider).toBe(provider);
    expect(source.project).toEqual({
      system: 'launchdarkly',
      projectId: 'x',
      teamId: 'y',
    });
    expect(isSource(source)).toBe(true);
  });

  it('does not modify the provider', () => {
    const provider = new TypedInMemoryProvider(myFlags);
    defineSource({
      provider,
      project: { system: 'launchdarkly', projectId: 'x', teamId: 'y' },
    });

    expect(provider.metadata).toEqual({ name: 'in-memory' });
  });

  it('keeps getEvaluationContext', () => {
    const getEvaluationContext = () => ({ targetingKey: 'user' });
    const source = defineSource({
      provider: new TypedInMemoryProvider(myFlags),
      project: { system: 'in-memory' },
      getEvaluationContext,
    });

    expect(source.getEvaluationContext).toBe(getEvaluationContext);
  });

  it('can not be modified', () => {
    const project = { system: 'in-memory' } as const;
    const source = defineSource({
      provider: new TypedInMemoryProvider(myFlags),
      project,
    });

    expect(Object.isFrozen(source)).toBe(true);
    expect(Object.isFrozen(source.project)).toBe(true);
    expect(source.project).not.toBe(project);
  });

  it('narrows the types by system', () => {
    const source = defineSource({
      provider: new TypedInMemoryProvider(myFlags),
      project: { system: 'launchdarkly', projectId: 'x', teamId: 'y' },
    });

    expectTypeOf(source.provider).toEqualTypeOf<
      TypedInMemoryProvider<typeof myFlags>
    >();
    expectTypeOf(source.project?.system).toEqualTypeOf<
      'launchdarkly' | undefined
    >();
    expectTypeOf(source.project?.projectId).toEqualTypeOf<string | undefined>();
    expectTypeOf(source.project?.teamId).toEqualTypeOf<string | undefined>();
  });

  it('supports platforms without project fields', () => {
    const source = defineSource({
      provider: new TypedInMemoryProvider(myFlags),
      project: { system: 'in-memory' },
    });

    expect(source.project).toEqual({ system: 'in-memory' });
    expectTypeOf(source.project?.system).toEqualTypeOf<
      'in-memory' | undefined
    >();
    // @ts-expect-error in-memory has no projectId
    source.project?.projectId;
  });

  it('accepts a vercel-flags project with or without projectId and teamId', () => {
    const provider = new TypedInMemoryProvider(myFlags);

    // The platform project of Vercel
    defineSource({ provider, project: { system: 'vercel-flags' } });
    // A different project of the same team
    defineSource({
      provider,
      project: { system: 'vercel-flags', projectId: 'prj_blog' },
    });
    // A project of a different team
    const source = defineSource({
      provider,
      project: {
        system: 'vercel-flags',
        projectId: 'prj_blog',
        teamId: 'team_blog',
      },
    });

    expectTypeOf(source.project?.projectId).toEqualTypeOf<
      string | undefined | undefined
    >();
    expectTypeOf(source.project?.teamId).toEqualTypeOf<
      string | undefined | undefined
    >();
  });

  it('rejects invalid projects at the type level', () => {
    const provider = new TypedInMemoryProvider(myFlags);

    defineSource({
      provider,
      // @ts-expect-error unknown system
      project: { system: 'unknown', projectId: 'x' },
    });

    // The links of LaunchDarkly do not use teamId, so it is optional
    defineSource({
      provider,
      project: { system: 'launchdarkly', projectId: 'x' },
    });

    defineSource({
      provider,
      // @ts-expect-error projectId is required for launchdarkly
      project: { system: 'launchdarkly' },
    });

    defineSource({
      provider,
      project: {
        system: 'launchdarkly',
        projectId: 'x',
        teamId: 'y',
        // @ts-expect-error unknown field
        unknownField: true,
      },
    });

    defineSource({
      provider,
      project: {
        system: 'in-memory',
        // @ts-expect-error in-memory has no projectId
        projectId: 'x',
      },
    });
  });

  it('only recognizes sources returned by defineSource', () => {
    expect(
      isSource({
        provider: new TypedInMemoryProvider(myFlags),
        project: { system: 'in-memory' },
      }),
    ).toBe(false);
    expect(isSource(null)).toBe(false);
  });

  it('throws for the old field platform', () => {
    expect(() =>
      defineSource({
        provider: {
          metadata: { name: 'x' },
          resolveBooleanEvaluation: async () => ({ value: true }),
        },
        // @ts-expect-error platform is now the deployment platform
        project: { platform: 'in-memory' },
      }),
    ).toThrow(
      'flags: Use `system` instead of `platform` for the flag management system of a project.',
    );
  });
});

describe('a source without a project', () => {
  it('evaluates its flags, and the manifest names no source', async () => {
    const { bindFlag } = await import('./flag');
    const { createManifest } = await import('./manifest');
    const source = defineSource({
      provider: new TypedInMemoryProvider(myFlags),
    });
    const flag = bindFlag({ key: 'v2_enabled', source });

    expect(source.project).toBeUndefined();
    await expect(flag()).resolves.toBe(true);
    const manifest = createManifest([{ id: 'flags.ts', exports: { flag } }]);
    expect(manifest.sources).toEqual({});
    expect(manifest.definitions.v2_enabled?.source).toBeUndefined();
  });
});
