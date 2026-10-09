import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { defineConnection, isConnection } from './connection';

const myFlags = {
  v2_enabled: {
    variants: { on: true, off: false },
    disabled: false,
    defaultVariant: 'on',
  },
} as const;

describe('defineConnection', () => {
  it('connects a provider to a project', () => {
    const provider = new TypedInMemoryProvider(myFlags);
    const connection = defineConnection({
      provider,
      project: { platform: 'launchdarkly', projectId: 'x', teamId: 'y' },
    });

    expect(connection.provider).toBe(provider);
    expect(connection.project).toEqual({
      platform: 'launchdarkly',
      projectId: 'x',
      teamId: 'y',
    });
    expect(isConnection(connection)).toBe(true);
  });

  it('does not modify the provider', () => {
    const provider = new TypedInMemoryProvider(myFlags);
    defineConnection({
      provider,
      project: { platform: 'launchdarkly', projectId: 'x', teamId: 'y' },
    });

    expect(provider.metadata).toEqual({ name: 'in-memory' });
  });

  it('keeps getEvaluationContext', () => {
    const getEvaluationContext = () => ({ targetingKey: 'user' });
    const connection = defineConnection({
      provider: new TypedInMemoryProvider(myFlags),
      project: { platform: 'in-memory' },
      getEvaluationContext,
    });

    expect(connection.getEvaluationContext).toBe(getEvaluationContext);
  });

  it('can not be modified', () => {
    const project = { platform: 'in-memory' } as const;
    const connection = defineConnection({
      provider: new TypedInMemoryProvider(myFlags),
      project,
    });

    expect(Object.isFrozen(connection)).toBe(true);
    expect(Object.isFrozen(connection.project)).toBe(true);
    expect(connection.project).not.toBe(project);
  });

  it('narrows the types by platform', () => {
    const connection = defineConnection({
      provider: new TypedInMemoryProvider(myFlags),
      project: { platform: 'launchdarkly', projectId: 'x', teamId: 'y' },
    });

    expectTypeOf(connection.provider).toEqualTypeOf<
      TypedInMemoryProvider<typeof myFlags>
    >();
    expectTypeOf(connection.project.platform).toEqualTypeOf<'launchdarkly'>();
    expectTypeOf(connection.project.projectId).toEqualTypeOf<string>();
    expectTypeOf(connection.project.teamId).toEqualTypeOf<string>();
  });

  it('supports platforms without project fields', () => {
    const connection = defineConnection({
      provider: new TypedInMemoryProvider(myFlags),
      project: { platform: 'in-memory' },
    });

    expect(connection.project).toEqual({ platform: 'in-memory' });
    expectTypeOf(connection.project.platform).toEqualTypeOf<'in-memory'>();
    // @ts-expect-error in-memory has no projectId
    connection.project.projectId;
  });

  it('rejects invalid projects at the type level', () => {
    const provider = new TypedInMemoryProvider(myFlags);

    defineConnection({
      provider,
      // @ts-expect-error unknown platform
      project: { platform: 'unknown', projectId: 'x' },
    });

    defineConnection({
      provider,
      // @ts-expect-error teamId is required for launchdarkly
      project: { platform: 'launchdarkly', projectId: 'x' },
    });

    defineConnection({
      provider,
      project: {
        platform: 'launchdarkly',
        projectId: 'x',
        teamId: 'y',
        // @ts-expect-error unknown field
        unknownField: true,
      },
    });

    defineConnection({
      provider,
      project: {
        platform: 'in-memory',
        // @ts-expect-error in-memory has no projectId
        projectId: 'x',
      },
    });
  });

  it('only recognizes connections returned by defineConnection', () => {
    expect(
      isConnection({
        provider: new TypedInMemoryProvider(myFlags),
        project: { platform: 'in-memory' },
      }),
    ).toBe(false);
    expect(isConnection(null)).toBe(false);
  });
});
