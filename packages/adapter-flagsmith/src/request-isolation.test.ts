import type { Adapter } from 'flags';
import { describe, expect, it, vi } from 'vitest';
import {
  createFlagsmithAdapter,
  type EntitiesType,
  type FlagsmithConfig,
} from './index';

type DecideArgs = Parameters<Adapter<unknown, EntitiesType>['decide']>[0];

function setup() {
  const fetch = vi.fn(
    async (
      _url: Parameters<NonNullable<FlagsmithConfig['fetch']>>[0],
      options?: RequestInit,
    ) => {
      const body = options?.body ? JSON.parse(String(options.body)) : undefined;
      const identifier = body?.identifier;
      const tier = body?.traits?.find(
        (trait: { trait_key: string }) => trait.trait_key === 'tier',
      )?.trait_value;
      const flags = ['plan', 'other'].map((name) => ({
        feature: { name },
        enabled: true,
        feature_state_value: identifier ? `${identifier}:${tier}` : 'anonymous',
      }));
      return new Response(
        JSON.stringify(identifier ? { flags, traits: body.traits } : flags),
      );
    },
  );
  const create = (environmentKey = 'environment-a') =>
    createFlagsmithAdapter({
      environmentKey,
      fetch,
      enableLocalEvaluation: false,
      retries: 0,
    });
  const adapter = create();
  const evaluate = (
    headers: Headers,
    entities?: EntitiesType,
    key = 'plan',
    target = adapter,
  ) =>
    target.getValue().decide({
      key,
      headers,
      entities,
      defaultValue: 'fallback',
      cookies: {} as DecideArgs['cookies'],
    });
  return { fetch, create, evaluate };
}

const alice = { targetingKey: 'alice', traits: { tier: 'gold' } };

describe('Flagsmith request isolation with the real SDK', () => {
  it('shares one evaluation across concurrent flags with equivalent identities', async () => {
    const { fetch, evaluate } = setup();
    const headers = new Headers();
    const first = { targetingKey: 'alice', traits: { tier: 'gold', age: 30 } };
    const second = { targetingKey: 'alice', traits: { age: 30, tier: 'gold' } };
    expect(
      await Promise.all([
        evaluate(headers, first),
        evaluate(headers, second, 'other'),
      ]),
    ).toEqual(['alice:gold', 'alice:gold']);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await evaluate(headers, alice)).toBe('alice:gold');
    expect(fetch).toHaveBeenCalledTimes(2); // Different traits require a new context.
  });

  it('does not retain a signed-in identity for subsequent anonymous requests', async () => {
    const { fetch, evaluate } = setup();
    expect(await evaluate(new Headers())).toBe('anonymous');
    expect(await evaluate(new Headers(), alice)).toBe('alice:gold');
    expect(await evaluate(new Headers())).toBe('anonymous');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[2]?.[0]).toMatch(/\/flags\/$/);
    expect(fetch.mock.calls[2]?.[1]?.body).toBeUndefined();
  });

  it('isolates identities and traits within the same request', async () => {
    const { fetch, evaluate } = setup();
    const headers = new Headers();
    expect(
      await Promise.all([
        evaluate(headers, alice),
        evaluate(headers),
        evaluate(headers, { targetingKey: 'bob', traits: { tier: 'silver' } }),
        evaluate(headers, {
          targetingKey: 'alice',
          traits: { tier: 'bronze' },
        }),
      ]),
    ).toEqual(['alice:gold', 'anonymous', 'bob:silver', 'alice:bronze']);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('does not share evaluation between requests with identical header values', async () => {
    const { fetch, evaluate } = setup();
    await Promise.all([
      evaluate(new Headers(), alice),
      evaluate(new Headers(), alice),
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('isolates separate adapter configurations on the same request', async () => {
    const { fetch, create, evaluate } = setup();
    const headers = new Headers();
    expect(await evaluate(headers, alice)).toBe('alice:gold');
    expect(
      await evaluate(headers, undefined, 'plan', create('environment-b')),
    ).toBe('anonymous');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[0]).toMatch(/\/flags\/$/);
    expect(fetch.mock.calls[1]?.[1]?.body).toBeUndefined();
  });

  it('shares a failed evaluation within a request but retries on the next request', async () => {
    const { fetch, evaluate } = setup();
    fetch.mockRejectedValueOnce(new Error('unavailable'));
    const headers = new Headers();
    const results = await Promise.allSettled([
      evaluate(headers, alice),
      evaluate(headers, alice, 'other'),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      'rejected',
      'rejected',
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await evaluate(new Headers(), alice)).toBe('alice:gold');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
