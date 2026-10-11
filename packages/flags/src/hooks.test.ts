import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineConnection } from './connection';
import { FlagEvaluationError } from './errors';
import { evaluate } from './evaluate';
import { defineFlag } from './flag';
import { OVERRIDE_REASON } from './hooks';
import { encryptOverrides } from './overrides';
import { runtime } from './runtime';
import type { EvaluationDetails, Hook, HookFlagValue, Provider } from './types';

function inMemory() {
  return new TypedInMemoryProvider({
    'summer-sale': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: (context) => (context.user === 'alice' ? 'on' : 'off'),
    },
  } as const);
}

/**
 * A hook which writes each stage to a list.
 */
function recorder(name: string, steps: string[]): Hook {
  return {
    before: () => {
      steps.push(`${name}: before`);
    },
    after: () => {
      steps.push(`${name}: after`);
    },
    error: () => {
      steps.push(`${name}: error`);
    },
    finally: () => {
      steps.push(`${name}: finally`);
    },
  };
}

beforeEach(() => {
  runtime.reset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('hooks', () => {
  it('runs the stages in the order of OpenFeature', async () => {
    const steps: string[] = [];
    const provider = Object.assign(inMemory(), {
      hooks: [recorder('provider', steps)],
    });
    runtime.configure({ hooks: [recorder('config', steps)] });
    const connection = defineConnection({
      provider,
      project: { system: 'in-memory' },
      hooks: [recorder('connection', steps)],
    });
    const flag = defineFlag({ key: 'summer-sale', connection });

    await flag({ hooks: [recorder('call', steps)] });
    expect(steps).toEqual([
      'config: before',
      'connection: before',
      'call: before',
      'provider: before',
      'provider: after',
      'call: after',
      'connection: after',
      'config: after',
      'provider: finally',
      'call: finally',
      'connection: finally',
      'config: finally',
    ]);
  });

  it('gives the hooks the context, the details and the hints', async () => {
    const after = vi.fn<NonNullable<Hook['after']>>();
    const connection = defineConnection({
      provider: inMemory(),
      project: { system: 'in-memory' },
    });
    const flag = defineFlag({
      key: 'summer-sale',
      connection,
      defaultValue: false,
    });

    await flag({
      evaluationContext: { user: 'alice' },
      hooks: [{ after }],
      hookHints: { source: 'test' },
    });
    const [hookContext, details, hints] = after.mock.calls[0] ?? [];
    expect(hookContext).toMatchObject({
      flagKey: 'summer-sale',
      defaultValue: false,
      flagValueType: 'boolean',
      context: { user: 'alice' },
      providerMetadata: { name: 'in-memory' },
      clientMetadata: { sdk: 'js-server', paradigm: 'server' },
    });
    expect(details).toMatchObject({
      flagKey: 'summer-sale',
      value: true,
      variant: 'on',
      reason: 'TARGETING_MATCH',
      flagMetadata: {},
    });
    expect(hints).toEqual({ source: 'test' });
  });

  it('merges the context which a before hook returns', async () => {
    const seen = vi.fn();
    const connection = defineConnection({
      provider: inMemory(),
      project: { system: 'in-memory' },
    });
    const input = { user: 'bob' };
    const flag = defineFlag({ key: 'summer-sale', connection });

    const value = await flag({
      evaluationContext: input,
      hooks: [
        { before: () => ({ user: 'alice' }) },
        { before: (hookContext) => seen(hookContext.context) },
      ],
    });
    expect(value).toBe(true);
    expect(seen).toHaveBeenCalledWith({ user: 'alice' });
    // The context of the call side does not change
    expect(input).toEqual({ user: 'bob' });
  });

  it('keeps the data of each hook from one stage to the next', async () => {
    const durations: unknown[] = [];
    const timer: Hook = {
      before: (hookContext) => {
        hookContext.hookData.set('start', 1);
      },
      finally: (hookContext) => {
        durations.push(hookContext.hookData.get('start'));
      },
    };
    const other: Hook = {
      finally: (hookContext) => {
        durations.push(hookContext.hookData.get('start'));
      },
    };
    const connection = defineConnection({
      provider: inMemory(),
      project: { system: 'in-memory' },
    });

    await defineFlag({ key: 'summer-sale', connection })({
      hooks: [timer, other],
    });
    expect(durations).toEqual([undefined, 1]);
  });

  it('runs error and finally when the evaluation fails', async () => {
    const steps: string[] = [];
    const error = vi.fn<NonNullable<Hook['error']>>();
    const final = vi.fn<NonNullable<Hook['finally']>>();
    const connection = defineConnection({
      provider: inMemory(),
      project: { system: 'in-memory' },
      hooks: [recorder('connection', steps), { error, finally: final }],
    });
    const flag = defineFlag({ key: 'missing', connection, defaultValue: true });

    await expect(flag()).resolves.toBe(true);
    expect(steps).toEqual([
      'connection: before',
      'connection: error',
      'connection: finally',
    ]);
    expect(error.mock.calls[0]?.[1]).toBeInstanceOf(FlagEvaluationError);
    expect(final.mock.calls[0]?.[1]).toMatchObject({
      flagKey: 'missing',
      value: true,
      reason: 'ERROR',
      errorCode: 'FLAG_NOT_FOUND',
    });
  });

  it('fails the evaluation when a before or after hook throws', async () => {
    const connection = defineConnection({
      provider: inMemory(),
      project: { system: 'in-memory' },
    });
    const flag = defineFlag({ key: 'summer-sale', connection });
    const provider = vi.spyOn(connection.provider, 'resolveBooleanEvaluation');

    await expect(
      flag({
        hooks: [
          {
            before: () => {
              throw new Error('Not allowed');
            },
          },
        ],
      }),
    ).rejects.toThrow(
      'flags: Could not evaluate flag "summer-sale": Not allowed',
    );
    expect(provider).not.toHaveBeenCalled();

    await expect(
      flag({
        hooks: [
          {
            after: () => {
              throw new Error('Bad value');
            },
          },
        ],
      }),
    ).rejects.toThrow('Bad value');
  });

  it('logs errors of error and finally hooks, and keeps the result', async () => {
    const connection = defineConnection({
      provider: inMemory(),
      project: { system: 'in-memory' },
    });
    const flag = defineFlag({ key: 'summer-sale', connection });

    const value = await flag({
      hooks: [
        {
          finally: () => {
            throw new Error('Oops');
          },
        },
      ],
    });
    expect(value).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      'flags: A finally hook failed.',
      expect.any(Error),
    );
  });

  it('runs the hooks of the call side for each flag of evaluate', async () => {
    const keys: string[] = [];
    const connection = defineConnection({
      provider: inMemory(),
      project: { system: 'in-memory' },
    });
    const a = defineFlag({ key: 'summer-sale', connection });
    const b = defineFlag({ key: 'missing', connection, defaultValue: false });

    await evaluate([a, b], {
      hooks: [
        { finally: (hookContext) => void keys.push(hookContext.flagKey) },
      ],
    });
    expect(keys.sort()).toEqual(['missing', 'summer-sale']);
  });

  it('does not run hooks for a provider which is not supported', async () => {
    const before = vi.fn();
    const provider: Provider = {
      metadata: { name: 'booleans' },
      resolveBooleanEvaluation: async () => ({ value: true }),
    };
    const connection = defineConnection({
      provider,
      project: { system: 'in-memory' },
      hooks: [{ before }],
    });
    const flag = defineFlag({
      key: 'banner',
      type: 'string',
      connection,
      defaultValue: 'Welcome',
    });

    await expect(flag()).resolves.toBe('Welcome');
    expect(before).not.toHaveBeenCalled();
  });

  describe('overrides', () => {
    beforeEach(() => {
      vi.stubEnv(
        'FLAGS_SECRET',
        Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
          'base64url',
        ),
      );
    });

    async function requestWithOverride() {
      const token = await encryptOverrides({ 'summer-sale': true });
      return new Request('https://shop.example', {
        headers: { cookie: `flag-overrides=${token}` },
      });
    }

    it('runs all hooks with the reason OVERRIDE', async () => {
      const after = vi.fn<NonNullable<Hook['after']>>();
      const providerAfter = vi.fn<NonNullable<Hook['after']>>();
      const provider = Object.assign(inMemory(), {
        hooks: [{ after: providerAfter }],
      });
      const resolve = vi.spyOn(provider, 'resolveBooleanEvaluation');
      const connection = defineConnection({
        provider,
        project: { system: 'in-memory' },
      });
      runtime.configure({ hooks: [{ after }] });
      const flag = defineFlag({ key: 'summer-sale', connection });

      const value = await runtime.onInvoke(await requestWithOverride(), () =>
        flag({ evaluationContext: { user: 'bob' } }),
      );
      expect(value).toBe(true);
      expect(after.mock.calls[0]?.[0].context).toEqual({ user: 'bob' });
      expect(after.mock.calls[0]?.[1]).toEqual({
        flagKey: 'summer-sale',
        value: true,
        reason: 'OVERRIDE',
        flagMetadata: {},
      } satisfies EvaluationDetails<HookFlagValue>);
      // The hook of the provider knows that the provider did not evaluate
      // the flag
      expect(providerAfter.mock.calls[0]?.[1].reason).toBe(OVERRIDE_REASON);
      expect(resolve).not.toHaveBeenCalled();
    });

    it('does not create the context for an override without hooks', async () => {
      const getEvaluationContext = vi.fn(() => ({}));
      const connection = defineConnection({
        provider: inMemory(),
        project: { system: 'in-memory' },
        getEvaluationContext,
      });
      const flag = defineFlag({ key: 'summer-sale', connection });

      await expect(
        runtime.onInvoke(await requestWithOverride(), () => flag()),
      ).resolves.toBe(true);
      expect(getEvaluationContext).not.toHaveBeenCalled();
    });
  });
});
