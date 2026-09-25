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
  it('fetches once per native batch', async () => {
    const { fetch, create } = setup();
    const adapter = create().getValue();
    expect(
      await adapter.bulkDecide!({
        flags: [{ key: 'plan' }, { key: 'other' }],
        headers: new Headers(),
        cookies: {} as DecideArgs['cookies'],
        entities: alice,
      }),
    ).toEqual({ plan: 'alice:gold', other: 'alice:gold' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toMatch(/\/identities\/$/);
  });

  it('groups adapters by configuration and coercion mode', () => {
    const { create } = setup();
    const first = create();
    expect(first.getValue().adapterId).toBe(first.getValue().adapterId);
    expect(first.getValue({ coerce: 'string' }).adapterId).toBe(
      first.getValue({ coerce: 'string' }).adapterId,
    );
    expect(first.getValue({ coerce: 'string' }).adapterId).not.toBe(
      first.getValue({ coerce: 'boolean' }).adapterId,
    );
    expect(first.getValue().adapterId).not.toBe(create().getValue().adapterId);
  });

  it('preserves coercion and defaults for every value in a batch', async () => {
    const adapter = createFlagsmithAdapter({
      environmentKey: 'test',
      retries: 0,
      fetch: async () =>
        Response.json([
          {
            feature: { name: 'number' },
            enabled: true,
            feature_state_value: '42',
          },
          {
            feature: { name: 'boolean' },
            enabled: true,
            feature_state_value: 'false',
          },
          {
            feature: { name: 'disabled' },
            enabled: false,
            feature_state_value: 'ignored',
          },
          {
            feature: { name: 'empty' },
            enabled: true,
            feature_state_value: '',
          },
        ]),
    });
    const flags = ['number', 'boolean', 'disabled', 'empty'].map((key) => ({
      key,
      defaultValue: 'fallback',
    }));
    const args = {
      flags,
      headers: new Headers(),
      cookies: {} as DecideArgs['cookies'],
    };
    expect(
      await adapter.getValue({ coerce: 'string' }).bulkDecide!(args),
    ).toEqual({
      number: '42',
      boolean: 'false',
      disabled: 'fallback',
      empty: 'fallback',
    });
    expect(
      await adapter.getValue({ coerce: 'boolean' }).bulkDecide!(args),
    ).toEqual({
      number: true,
      boolean: false,
      disabled: 'fallback',
      empty: 'fallback',
    });
    expect(
      await adapter.getValue({ coerce: 'number' }).bulkDecide!(args),
    ).toEqual({
      number: 42,
      boolean: 'fallback',
      disabled: 'fallback',
      empty: 'fallback',
    });
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

  it('retries failed evaluations without retaining rejected promises', async () => {
    const { fetch, evaluate } = setup();
    fetch.mockRejectedValueOnce(new Error('unavailable'));
    const headers = new Headers();
    await expect(evaluate(headers, alice)).rejects.toThrow();
    expect(await evaluate(headers, alice)).toBe('alice:gold');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
