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
      project: { system: 'launchdarkly', projectId: 'x', teamId: 'y' },
    });

    expect(connection.provider).toBe(provider);
    expect(connection.project).toEqual({
      system: 'launchdarkly',
      projectId: 'x',
      teamId: 'y',
    });
    expect(isConnection(connection)).toBe(true);
  });

  it('does not modify the provider', () => {
    const provider = new TypedInMemoryProvider(myFlags);
    defineConnection({
      provider,
      project: { system: 'launchdarkly', projectId: 'x', teamId: 'y' },
    });

    expect(provider.metadata).toEqual({ name: 'in-memory' });
  });

  it('keeps getEvaluationContext', () => {
    const getEvaluationContext = () => ({ targetingKey: 'user' });
    const connection = defineConnection({
      provider: new TypedInMemoryProvider(myFlags),
      project: { system: 'in-memory' },
      getEvaluationContext,
    });

    expect(connection.getEvaluationContext).toBe(getEvaluationContext);
  });

  it('can not be modified', () => {
    const project = { system: 'in-memory' } as const;
    const connection = defineConnection({
      provider: new TypedInMemoryProvider(myFlags),
      project,
    });

    expect(Object.isFrozen(connection)).toBe(true);
    expect(Object.isFrozen(connection.project)).toBe(true);
    expect(connection.project).not.toBe(project);
  });

  it('narrows the types by system', () => {
    const connection = defineConnection({
      provider: new TypedInMemoryProvider(myFlags),
      project: { system: 'launchdarkly', projectId: 'x', teamId: 'y' },
    });

    expectTypeOf(connection.provider).toEqualTypeOf<
      TypedInMemoryProvider<typeof myFlags>
    >();
    expectTypeOf(connection.project.system).toEqualTypeOf<'launchdarkly'>();
    expectTypeOf(connection.project.projectId).toEqualTypeOf<string>();
    expectTypeOf(connection.project.teamId).toEqualTypeOf<string>();
  });

  it('supports platforms without project fields', () => {
    const connection = defineConnection({
      provider: new TypedInMemoryProvider(myFlags),
      project: { system: 'in-memory' },
    });

    expect(connection.project).toEqual({ system: 'in-memory' });
    expectTypeOf(connection.project.system).toEqualTypeOf<'in-memory'>();
    // @ts-expect-error in-memory has no projectId
    connection.project.projectId;
  });

  it('accepts a vercel-flags project with or without projectId and teamId', () => {
    const provider = new TypedInMemoryProvider(myFlags);

    // The platform project of Vercel
    defineConnection({ provider, project: { system: 'vercel-flags' } });
    // A different project of the same team
    defineConnection({
      provider,
      project: { system: 'vercel-flags', projectId: 'prj_blog' },
    });
    // A project of a different team
    const connection = defineConnection({
      provider,
      project: {
        system: 'vercel-flags',
        projectId: 'prj_blog',
        teamId: 'team_blog',
      },
    });

    expectTypeOf(connection.project.projectId).toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf(connection.project.teamId).toEqualTypeOf<string | undefined>();
  });

  it('rejects invalid projects at the type level', () => {
    const provider = new TypedInMemoryProvider(myFlags);

    defineConnection({
      provider,
      // @ts-expect-error unknown system
      project: { system: 'unknown', projectId: 'x' },
    });

    defineConnection({
      provider,
      // @ts-expect-error teamId is required for launchdarkly
      project: { system: 'launchdarkly', projectId: 'x' },
    });

    defineConnection({
      provider,
      project: {
        system: 'launchdarkly',
        projectId: 'x',
        teamId: 'y',
        // @ts-expect-error unknown field
        unknownField: true,
      },
    });

    defineConnection({
      provider,
      project: {
        system: 'in-memory',
        // @ts-expect-error in-memory has no projectId
        projectId: 'x',
      },
    });
  });

  it('only recognizes connections returned by defineConnection', () => {
    expect(
      isConnection({
        provider: new TypedInMemoryProvider(myFlags),
        project: { system: 'in-memory' },
      }),
    ).toBe(false);
    expect(isConnection(null)).toBe(false);
  });

  it('throws for the old field platform', () => {
    expect(() =>
      defineConnection({
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
