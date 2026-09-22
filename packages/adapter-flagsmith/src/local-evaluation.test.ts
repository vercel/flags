import { Flagsmith } from '@flagsmith/nodejs';
import type { Adapter } from 'flags';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type AdapterResponse,
  createFlagsmithAdapter,
  type EntitiesType,
  type FlagsmithConfig,
} from './index';

type DecideArgs = Parameters<Adapter<unknown, EntitiesType>['decide']>[0];

function feature(value: string, name = 'plan', id = 1) {
  return {
    feature: { id, name, type: 'STANDARD' },
    enabled: true,
    feature_state_value: value,
    featurestate_uuid: `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`,
    multivariate_feature_state_values: [],
  };
}

function environment(value = 'free') {
  return {
    id: 1,
    api_key: 'environment-a',
    name: 'Test',
    project: {
      id: 1,
      name: 'Test',
      hide_disabled_flags: false,
      organisation: { id: 1, name: 'Test', stop_serving_flags: false },
      segments: [
        {
          id: 1,
          name: 'Gold',
          rules: [
            {
              type: 'ALL',
              conditions: [
                { property_: 'tier', operator: 'EQUAL', value: 'gold' },
              ],
              rules: [],
            },
          ],
          feature_states: [feature('gold')],
        },
      ],
    },
    feature_states: [feature(value), feature('hello', 'message', 2)],
    identity_overrides: [
      {
        identifier: 'vip',
        environment_api_key: 'environment-a',
        identity_uuid: '00000000-0000-0000-0000-000000000003',
        created_date: '2026-01-01T00:00:00Z',
        identity_features: [feature('vip')],
      },
    ],
  };
}

const adapters: AdapterResponse[] = [];
function setup(config: FlagsmithConfig = {}) {
  const fetch = vi.fn(async () => Response.json(environment()));
  const adapter = createFlagsmithAdapter({
    environmentKey: 'ser.test',
    enableLocalEvaluation: true,
    fetch,
    retries: 0,
    ...config,
  });
  adapters.push(adapter);
  const evaluate = (
    headers = new Headers(),
    entities?: EntitiesType,
    key = 'plan',
  ) =>
    adapter.getValue().decide({
      key,
      headers,
      entities,
      cookies: {} as DecideArgs['cookies'],
      defaultValue: 'fallback',
    });
  return { adapter, fetch, evaluate };
}

afterEach(async () => {
  await Promise.all(adapters.splice(0).map((adapter) => adapter.close()));
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Flagsmith local evaluation with the real server SDK', () => {
  it('lazily fetches one environment document shared across flags, identities, and requests', async () => {
    const { evaluate, fetch } = setup();
    expect(fetch).not.toHaveBeenCalled();
    const headers = new Headers();
    expect(
      await Promise.all([
        evaluate(headers),
        evaluate(headers, undefined, 'message'),
        evaluate(headers, { targetingKey: 'alice', traits: { tier: 'gold' } }),
        evaluate(new Headers(), { targetingKey: 'bob', traits: {} }),
        evaluate(new Headers(), { targetingKey: 'vip', traits: {} }),
      ]),
    ).toEqual(['free', 'hello', 'gold', 'free', 'vip']);
    expect(await evaluate()).toBe('free');
    expect(
      await evaluate(new Headers(), { targetingKey: 'alice', traits: {} }),
    ).toBe('free');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://edge.api.flagsmith.com/api/v1/environment-document/',
      expect.objectContaining({
        method: 'GET',
        body: undefined,
        headers: expect.objectContaining({ 'X-Environment-Key': 'ser.test' }),
      }),
    );
  });

  it('evaluates a local batch once with the supplied identity', async () => {
    const spy = vi.spyOn(Flagsmith.prototype, 'getIdentityFlags');
    const { adapter } = setup();
    expect(
      await adapter.getValue().bulkDecide!({
        flags: [{ key: 'plan' }, { key: 'message' }],
        entities: { targetingKey: 'alice', traits: { tier: 'gold' } },
        headers: new Headers(),
        cookies: {} as DecideArgs['cookies'],
      }),
    ).toEqual({ plan: 'gold', message: 'hello' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('refreshes the shared environment and stops polling on close', async () => {
    vi.useFakeTimers();
    const { adapter, evaluate, fetch } = setup({
      environmentRefreshIntervalSeconds: 1,
    });
    const headers = new Headers();
    expect(await evaluate(headers)).toBe('free');
    fetch.mockImplementation(async () => Response.json(environment('updated')));
    await vi.advanceTimersByTimeAsync(1000);
    expect(await evaluate()).toBe('updated');
    expect(await evaluate(headers)).toBe('updated');
    expect(fetch).toHaveBeenCalledTimes(2);
    await adapter.close();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('isolates separate environments', async () => {
    const first = setup();
    const second = setup({ environmentKey: 'ser.other' });
    second.fetch.mockImplementation(async () =>
      Response.json(environment('other')),
    );
    expect(await first.evaluate()).toBe('free');
    expect(await second.evaluate()).toBe('other');
    expect(first.fetch).toHaveBeenCalledTimes(1);
    expect(second.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries failed environment retrieval on a subsequent request', async () => {
    const { evaluate, fetch } = setup();
    fetch.mockRejectedValueOnce(new Error('unavailable'));
    await expect(evaluate()).rejects.toThrow();
    expect(await evaluate()).toBe('free');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects client-side keys when local evaluation is enabled', async () => {
    const { evaluate, fetch } = setup({ environmentKey: 'client-key' });
    await expect(evaluate()).rejects.toThrow('server-side environment key');
    expect(fetch).not.toHaveBeenCalled();
  });
});
