import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import { evaluate, type FlagEvaluationContext } from './evaluate';
import { bindFlag } from './flag';
import { runtime } from './runtime';
import {
  type DefaultSourceInput,
  defineSource,
  type SourceInput,
} from './source';
import type { EvaluationContext, FlagsRequest, Provider } from './types';

function createProvider() {
  return {
    metadata: { name: 'test' },
    resolveBooleanEvaluation: vi.fn(async () => ({ value: true })),
  } satisfies Provider;
}

function contextOf(provider: ReturnType<typeof createProvider>, call = 0) {
  return (provider.resolveBooleanEvaluation.mock.calls[call] as unknown[])[2];
}

const request = { headers: new Headers({ 'x-user': 'alice' }) };

describe('context chain', () => {
  beforeEach(() => {
    runtime.reset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gives the context of the call side to the source', async () => {
    const provider = createProvider();
    const source = defineSource({
      provider,
      project: { system: 'in-memory' },
      getEvaluationContext: (_request, context: { teamId: string }) => ({
        team: { id: context.teamId },
      }),
    });
    const flag = bindFlag({ key: 'a', source });

    await flag({ evaluationContext: { teamId: 'team-1' } });
    expect(contextOf(provider)).toEqual({ team: { id: 'team-1' } });
  });

  it('runs the steps from the call side to the source', async () => {
    const order: string[] = [];
    const provider = createProvider();
    const source = defineSource({
      provider,
      project: { system: 'in-memory' },
      getEvaluationContext: (_request, context: { teamId: string }) => {
        order.push(`source:${context.teamId}`);
        return { team: { id: context.teamId } };
      },
    });
    const flag = bindFlag({
      key: 'a',
      source,
      getEvaluationContext: (_request, context: { slug: string }) => {
        order.push(`flag:${context.slug}`);
        return { teamId: `id-of-${context.slug}` };
      },
    });

    await flag({ evaluationContext: { slug: 'acme' } });
    expect(order).toEqual(['flag:acme', 'source:id-of-acme']);
    expect(contextOf(provider)).toEqual({ team: { id: 'id-of-acme' } });
  });

  it('supports the team of an API route', async () => {
    const teams = { 'team-1': { plan: 'enterprise' } };
    const provider = createProvider();
    const source = defineSource({
      provider,
      project: { system: 'in-memory' },
      getEvaluationContext: async (
        request,
        context: { teamId: keyof typeof teams },
      ) => ({
        user: request?.headers?.get('x-user') ?? null,
        team: { id: context.teamId, ...teams[context.teamId] },
      }),
    });
    const flag = bindFlag({ key: 'a', source });

    // e.g. GET /api/teams/team-1/settings
    await runtime.onInvoke(request, () =>
      flag({ evaluationContext: { teamId: 'team-1' } }),
    );
    expect(contextOf(provider)).toEqual({
      user: 'alice',
      team: { id: 'team-1', plan: 'enterprise' },
    });
  });

  it('lets a step keep the fields of the step before', async () => {
    const provider = createProvider();
    const source = defineSource({
      provider,
      project: { system: 'in-memory' },
      getEvaluationContext: (request, context: { country: string }) => ({
        ...context,
        user: request?.headers?.get('x-user') ?? null,
      }),
    });
    const flag = bindFlag({ key: 'a', source });

    await runtime.onInvoke(request, () =>
      flag({ evaluationContext: { country: 'CH' } }),
    );
    expect(contextOf(provider)).toEqual({ country: 'CH', user: 'alice' });
  });

  describe('missing steps', () => {
    it('gives the context of the call side to the provider', async () => {
      const provider = createProvider();
      const source = defineSource({
        provider,
        project: { system: 'in-memory' },
      });
      const flag = bindFlag({ key: 'a', source });

      await flag({ evaluationContext: { country: 'CH' } });
      expect(contextOf(provider)).toEqual({ country: 'CH' });
    });

    it('gives the context of the flag to the provider', async () => {
      const provider = createProvider();
      const source = defineSource({
        provider,
        project: { system: 'in-memory' },
      });
      const flag = bindFlag({
        key: 'a',
        source,
        getEvaluationContext: () => ({ source: 'flag' }),
      });

      await flag();
      expect(contextOf(provider)).toEqual({ source: 'flag' });
    });

    it('gives an empty context to the provider without any input', async () => {
      const provider = createProvider();
      const source = defineSource({
        provider,
        project: { system: 'in-memory' },
      });
      const flag = bindFlag({ key: 'a', source });

      await flag();
      expect(contextOf(provider)).toEqual({});
    });
  });

  describe('request', () => {
    it('is given to each step inside of a request', async () => {
      const received: (FlagsRequest | undefined)[] = [];
      const source = defineSource({
        provider: createProvider(),
        project: { system: 'in-memory' },
        getEvaluationContext: (request) => {
          received.push(request);
          return {};
        },
      });
      const flag = bindFlag({
        key: 'a',
        source,
        getEvaluationContext: (request) => {
          received.push(request);
          return undefined;
        },
      });

      await runtime.onInvoke(request, () => flag());
      expect(received).toHaveLength(2);
      expect(received[0]?.headers?.get('x-user')).toBe('alice');
      expect(received[1]).toBe(received[0]);
    });

    it('is undefined outside of a request', async () => {
      const received: unknown[] = [];
      const source = defineSource({
        provider: createProvider(),
        project: { system: 'in-memory' },
        getEvaluationContext: (request) => {
          received.push(request);
          return {};
        },
      });
      const flag = bindFlag({ key: 'a', source });

      await flag();
      expect(received).toEqual([undefined]);
    });
  });

  describe('cache', () => {
    function countingSource() {
      const step = vi.fn(
        (_request: unknown, context: { teamId: string } | undefined) => ({
          team: context?.teamId ?? 'none',
        }),
      );
      const source = defineSource({
        provider: createProvider(),
        project: { system: 'in-memory' },
        getEvaluationContext: step,
      });
      return { source, step };
    }

    it('runs a step once per request for the same input object', async () => {
      const { source, step } = countingSource();
      const a = bindFlag({ key: 'a', source });
      const b = bindFlag({ key: 'b', source });
      const evaluationContext = { teamId: 't1' };

      await runtime.onInvoke(request, async () => {
        await evaluate([a, b], { evaluationContext });
        await a({ evaluationContext });
      });
      expect(step).toHaveBeenCalledTimes(1);
    });

    it('runs a step once per request without input', async () => {
      const { source, step } = countingSource();
      const a = bindFlag({ key: 'a', source });
      const b = bindFlag({ key: 'b', source });

      await runtime.onInvoke(request, async () => {
        await Promise.all([a(), b()]);
        await a();
      });
      expect(step).toHaveBeenCalledTimes(1);
    });

    it('runs a step once for inputs with the same content', async () => {
      const { source, step } = countingSource();
      const a = bindFlag({ key: 'a', source });
      const b = bindFlag({ key: 'b', source });

      await runtime.onInvoke(request, async () => {
        await a({ evaluationContext: { teamId: 't1' } });
        await b({ evaluationContext: { teamId: 't1' } });
        await b({ evaluationContext: { teamId: 't2' } });
      });
      expect(step).toHaveBeenCalledTimes(2);
    });

    it('compares an input which is not plain data by identity', async () => {
      const { source, step } = countingSource();
      const a = bindFlag({ key: 'a', source });
      const b = bindFlag({ key: 'b', source });
      class Team {
        constructor(readonly teamId: string) {}
      }
      const team = new Team('t1');

      await runtime.onInvoke(request, async () => {
        await a({ evaluationContext: team });
        await b({ evaluationContext: team });
        await b({ evaluationContext: new Team('t1') });
      });
      expect(step).toHaveBeenCalledTimes(2);
    });

    it('runs a step again in the next request', async () => {
      const { source, step } = countingSource();
      const a = bindFlag({ key: 'a', source });

      await runtime.onInvoke(request, () => a());
      await runtime.onInvoke(request, () => a());
      expect(step).toHaveBeenCalledTimes(2);
    });

    it('runs a step on each evaluation outside of a request', async () => {
      const { source, step } = countingSource();
      const a = bindFlag({ key: 'a', source });

      await a();
      await a();
      expect(step).toHaveBeenCalledTimes(2);
    });

    it('caches the step of a flag once per request for the same input', async () => {
      const flagStep = vi.fn(
        (_request: unknown, context: { slug: string }) => ({
          teamId: context.slug,
        }),
      );
      const { source } = countingSource();
      const a = bindFlag({
        key: 'a',
        source,
        getEvaluationContext: flagStep,
      });
      const evaluationContext = { slug: 'acme' };

      await runtime.onInvoke(request, async () => {
        await a({ evaluationContext });
        await a({ evaluationContext });
      });
      expect(flagStep).toHaveBeenCalledTimes(1);
    });
  });

  describe('errors', () => {
    it('returns the default value when the step of the flag throws', async () => {
      const source = defineSource({
        provider: createProvider(),
        project: { system: 'in-memory' },
      });
      const flag = bindFlag({
        key: 'a',
        defaultValue: false,
        source,
        getEvaluationContext: () => {
          throw new Error('No team');
        },
      });

      await expect(flag()).resolves.toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        'flags: Could not evaluate flag "a": No team. Returned the default value: false.',
      );
    });

    it('rejects without a default value when the source step throws', async () => {
      const source = defineSource({
        provider: createProvider(),
        project: { system: 'in-memory' },
        getEvaluationContext: async (): Promise<EvaluationContext> => {
          throw new Error('Team not found');
        },
      });
      const flag = bindFlag({ key: 'a', source });

      await expect(flag()).rejects.toMatchObject({
        name: 'FlagEvaluationError',
        message: 'flags: Could not evaluate flag "a": Team not found',
      });
    });
  });

  describe('types', () => {
    const teamSource = defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
      getEvaluationContext: (_request, context: { teamId: string }) => ({
        team: context.teamId,
      }),
    });
    const optionalSource = defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
      getEvaluationContext: (
        _request,
        context: { teamId: string } | undefined,
      ) => ({
        team: context?.teamId ?? null,
      }),
    });
    const plainSource = defineSource({
      provider: createProvider(),
      project: { system: 'in-memory' },
    });

    it('takes the input of a source from its getEvaluationContext', () => {
      expectTypeOf<SourceInput<typeof teamSource>>().toEqualTypeOf<{
        teamId: string;
      }>();
      expectTypeOf<
        SourceInput<typeof plainSource>
      >().toEqualTypeOf<DefaultSourceInput>();
    });

    it('requires the context of the source on the call side', () => {
      const flag = bindFlag({ key: 'a', source: teamSource });
      expectTypeOf<FlagEvaluationContext<typeof flag>>().toEqualTypeOf<{
        teamId: string;
      }>();

      void (() => {
        flag({ evaluationContext: { teamId: 't1' } });
        // @ts-expect-error the evaluation context is required
        flag();
        // @ts-expect-error teamId must be a string
        flag({ evaluationContext: { teamId: 1 } });
        // @ts-expect-error the source does not define "slug"
        flag({ evaluationContext: { slug: 'acme' } });
      });
    });

    it('makes the options optional if the input can be undefined', () => {
      const flag = bindFlag({ key: 'a', source: optionalSource });
      const plain = bindFlag({ key: 'b', source: plainSource });

      void (() => {
        flag();
        flag({ evaluationContext: { teamId: 't1' } });
        plain();
        plain({ evaluationContext: { anything: 'goes' } });
      });
    });

    it('requires the context of the flag when the flag has a step', () => {
      const flag = bindFlag({
        key: 'a',
        source: teamSource,
        getEvaluationContext: (_request, context: { slug: string }) => ({
          teamId: context.slug,
        }),
      });
      expectTypeOf<FlagEvaluationContext<typeof flag>>().toEqualTypeOf<{
        slug: string;
      }>();

      void (() => {
        flag({ evaluationContext: { slug: 'acme' } });
        // @ts-expect-error the flag expects a slug, not a teamId
        flag({ evaluationContext: { teamId: 't1' } });
      });
    });

    it('requires the step of a flag to return the input of the source', () => {
      void (() => {
        bindFlag({
          key: 'a',
          source: teamSource,
          // @ts-expect-error teamId must be a string
          getEvaluationContext: () => ({ teamId: 1 }),
        });
      });
    });

    it('types the request of each step', () => {
      defineSource({
        provider: createProvider(),
        project: { system: 'in-memory' },
        getEvaluationContext: (request, context) => {
          expectTypeOf(context).toEqualTypeOf<DefaultSourceInput>();
          expectTypeOf(request).toEqualTypeOf<FlagsRequest | undefined>();
          return {};
        },
      });
    });

    it('requires the input of the source for plain definitions', () => {
      void (() => {
        evaluate(
          { key: 'a', source: teamSource },
          { evaluationContext: { teamId: 't1' } },
        );
        // @ts-expect-error the evaluation context is required
        evaluate({ key: 'a', source: teamSource });
      });
    });

    it('requires the overlap of the contexts in evaluate', () => {
      const team = bindFlag({ key: 'a', source: teamSource });
      const slug = bindFlag({
        key: 'b',
        source: teamSource,
        getEvaluationContext: (_request, context: { slug: string }) => ({
          teamId: context.slug,
        }),
      });
      const optional = bindFlag({ key: 'c', source: optionalSource });

      void (() => {
        evaluate([team, slug], {
          evaluationContext: { teamId: 't1', slug: 'acme' },
        });
        // @ts-expect-error slug is missing
        evaluate([team, slug], { evaluationContext: { teamId: 't1' } });
        // @ts-expect-error the evaluation context is required for "team"
        evaluate([team, optional]);
        evaluate([optional]);
        evaluate([]);
      });
    });
  });
});
