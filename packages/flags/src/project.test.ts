import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { defineProject, getEvaluationContextGetter } from './project';
import type { Provider } from './types';

const myFlags = {
  v2_enabled: {
    variants: { on: true, off: false },
    disabled: false,
    defaultVariant: 'on',
  },
} as const;

describe('defineProject', () => {
  it('adds project metadata to an OpenFeature provider', () => {
    const provider = new TypedInMemoryProvider(myFlags);
    const project = defineProject(provider, {
      provider: 'launchdarkly',
      projectId: 'x',
      teamId: 'y',
    });

    expect(project).toBe(provider);
    expect(project.metadata).toEqual({
      name: 'in-memory',
      provider: 'launchdarkly',
      projectId: 'x',
      teamId: 'y',
    });
  });

  it('narrows the metadata type by provider name', () => {
    const project = defineProject(new TypedInMemoryProvider(myFlags), {
      provider: 'launchdarkly',
      projectId: 'x',
      teamId: 'y',
    });

    expectTypeOf(project).toExtend<TypedInMemoryProvider<typeof myFlags>>();
    expectTypeOf(project.metadata.name).toEqualTypeOf<'in-memory'>();
    expectTypeOf(project.metadata.provider).toEqualTypeOf<'launchdarkly'>();
    expectTypeOf(project.metadata.projectId).toEqualTypeOf<string>();
    expectTypeOf(project.metadata.teamId).toEqualTypeOf<string>();
  });

  it('supports providers without project fields', () => {
    const project = defineProject(new TypedInMemoryProvider(myFlags), {
      provider: 'in-memory',
    });

    expect(project.metadata).toEqual({
      name: 'in-memory',
      provider: 'in-memory',
    });
    expectTypeOf(project.metadata.provider).toEqualTypeOf<'in-memory'>();
    // @ts-expect-error in-memory has no projectId
    project.metadata.projectId;
  });

  it('rejects invalid options at the type level', () => {
    const provider = new TypedInMemoryProvider(myFlags);

    // @ts-expect-error unknown provider name
    defineProject(provider, { provider: 'unknown', projectId: 'x' });

    // @ts-expect-error teamId is required for launchdarkly
    defineProject(provider, { provider: 'launchdarkly', projectId: 'x' });

    defineProject(provider, {
      provider: 'launchdarkly',
      projectId: 'x',
      teamId: 'y',
      // @ts-expect-error unknown field
      unknownField: true,
    });

    defineProject(provider, {
      provider: 'in-memory',
      // @ts-expect-error in-memory has no projectId
      projectId: 'x',
    });
  });

  it('keeps the provider working', async () => {
    const provider = defineProject(new TypedInMemoryProvider(myFlags), {
      provider: 'launchdarkly',
      projectId: 'x',
      teamId: 'y',
    });

    await expect(
      provider.resolveBooleanEvaluation('v2_enabled', false, {}),
    ).resolves.toMatchObject({ value: true, variant: 'on' });
  });

  it('stores getEvaluationContext outside of the metadata', () => {
    const getEvaluationContext = () => ({ targetingKey: 'user' });
    const provider = defineProject(new TypedInMemoryProvider(myFlags), {
      provider: 'launchdarkly',
      projectId: 'x',
      teamId: 'y',
      getEvaluationContext,
    });

    expect(getEvaluationContextGetter(provider)).toBe(getEvaluationContext);
    expect(provider.metadata).not.toHaveProperty('getEvaluationContext');
  });

  it('returns no getEvaluationContext when none was passed', () => {
    const provider = defineProject(new TypedInMemoryProvider(myFlags), {
      provider: 'launchdarkly',
      projectId: 'x',
      teamId: 'y',
    });

    expect(getEvaluationContextGetter(provider)).toBeUndefined();
  });

  it('throws when the metadata getter returns a new object every time', () => {
    const provider: Provider = {
      get metadata() {
        return { name: 'getter' };
      },
      resolveBooleanEvaluation: async (_key, value) => ({ value }),
    };

    expect(() =>
      defineProject(provider, {
        provider: 'launchdarkly',
        projectId: 'x',
        teamId: 'y',
      }),
    ).toThrow(
      'flags: Could not add project metadata to provider "getter". The provider\'s metadata must be a mutable object.',
    );
  });

  it('throws when the metadata is frozen', () => {
    const provider: Provider = {
      metadata: Object.freeze({ name: 'frozen' }),
      resolveBooleanEvaluation: async (_key, value) => ({ value }),
    };

    expect(() =>
      defineProject(provider, {
        provider: 'launchdarkly',
        projectId: 'x',
        teamId: 'y',
      }),
    ).toThrow('Could not add project metadata to provider "frozen"');
  });
});
