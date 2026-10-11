import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineConnection } from './connection';
import { defineFlag } from './flag';
import { runtime } from './runtime';
import type { EventDetails, Provider, ProviderEventDetails } from './types';

/**
 * A minimal event emitter, like the one of OpenFeature providers.
 */
function createEmitter() {
  const handlers = new Map<
    string,
    Set<(details?: ProviderEventDetails) => unknown>
  >();
  return {
    addHandler: vi.fn(
      (event: string, handler: (details?: ProviderEventDetails) => unknown) => {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event)?.add(handler);
      },
    ),
    removeHandler: vi.fn(
      (event: string, handler: (details?: ProviderEventDetails) => unknown) => {
        handlers.get(event)?.delete(handler);
      },
    ),
    emit(event: string, details?: ProviderEventDetails) {
      for (const handler of handlers.get(event) ?? []) handler(details);
    },
    count: () => [...handlers.values()].reduce((sum, set) => sum + set.size, 0),
  };
}

function createConnection(initialize?: () => Promise<void>) {
  const events = createEmitter();
  const provider = {
    metadata: { name: 'events' },
    events,
    initialize: vi.fn(initialize ?? (async () => {})),
    onClose: vi.fn(async () => {}),
    resolveBooleanEvaluation: vi.fn(async () => ({ value: true })),
  } satisfies Provider;
  const connection = defineConnection({
    provider,
    project: { system: 'in-memory' },
  });
  return { connection, events, provider };
}

beforeEach(() => {
  runtime.reset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('events', () => {
  it('emits PROVIDER_READY when the initialization ends', async () => {
    const { connection } = createConnection();
    const ready = vi.fn();
    runtime.addHandler('PROVIDER_READY', ready);

    await defineFlag({ key: 'a', connection })();
    expect(ready).toHaveBeenCalledWith({ providerName: 'events' });
  });

  it('emits PROVIDER_ERROR when the initialization fails, and retries', async () => {
    const { connection, provider } = createConnection(async () => {
      throw new Error('Offline');
    });
    const error = vi.fn();
    runtime.addHandler('PROVIDER_ERROR', error);
    const flag = defineFlag({ key: 'a', connection });

    await expect(flag()).rejects.toThrow('Offline');
    expect(error).toHaveBeenCalledWith({
      providerName: 'events',
      message: 'Offline',
      errorCode: 'GENERAL',
    });
    await expect(flag()).rejects.toThrow('Offline');
    expect(provider.initialize).toHaveBeenCalledTimes(2);
  });

  it('gives the events of the provider to the handlers', async () => {
    const { connection, events } = createConnection();
    const changed = vi.fn<(details: EventDetails) => void>();
    runtime.addHandler('PROVIDER_CONFIGURATION_CHANGED', changed);
    await defineFlag({ key: 'a', connection })();

    events.emit('PROVIDER_CONFIGURATION_CHANGED', { flagsChanged: ['a'] });
    expect(changed).toHaveBeenCalledWith({
      providerName: 'events',
      flagsChanged: ['a'],
    });

    runtime.removeHandler('PROVIDER_CONFIGURATION_CHANGED', changed);
    events.emit('PROVIDER_CONFIGURATION_CHANGED', {});
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('runs a handler at once if the provider already has the status', async () => {
    const { connection, events } = createConnection();
    await defineFlag({ key: 'a', connection })();

    const ready = vi.fn();
    runtime.addHandler('PROVIDER_READY', ready);
    expect(ready).toHaveBeenCalledWith({ providerName: 'events' });

    events.emit('PROVIDER_STALE');
    const stale = vi.fn();
    runtime.addHandler('PROVIDER_STALE', stale);
    expect(stale).toHaveBeenCalledTimes(1);
  });

  it('stops evaluations after a fatal error, without retries', async () => {
    const { connection, events, provider } = createConnection();
    const flag = defineFlag({ key: 'a', connection });
    await flag();

    events.emit('PROVIDER_ERROR', {
      errorCode: 'PROVIDER_FATAL',
      message: 'The SDK key is not valid',
    });
    await expect(flag()).rejects.toMatchObject({
      code: 'PROVIDER_FATAL',
      message: 'flags: Could not evaluate flag "a": The SDK key is not valid',
    });
    expect(provider.resolveBooleanEvaluation).toHaveBeenCalledTimes(1);
    // A later READY does not change the fatal status
    events.emit('PROVIDER_READY');
    await expect(flag()).rejects.toMatchObject({ code: 'PROVIDER_FATAL' });
  });

  it('does not retry an initialization which fails with PROVIDER_FATAL', async () => {
    const { connection, provider } = createConnection(async () => {
      throw Object.assign(new Error('Wrong key'), { code: 'PROVIDER_FATAL' });
    });
    const flag = defineFlag({ key: 'a', connection, defaultValue: false });

    await expect(flag()).resolves.toBe(false);
    await expect(flag()).resolves.toBe(false);
    expect(provider.initialize).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      'flags: Could not evaluate flag "a": Wrong key. Returned the default value: false.',
    );
  });

  it('removes its handlers from the provider on shutdown', async () => {
    const { connection, events } = createConnection();
    await defineFlag({ key: 'a', connection })();
    expect(events.count()).toBe(4);

    await runtime.onShutdown();
    expect(events.count()).toBe(0);

    // The next use listens again
    await defineFlag({ key: 'b', connection })();
    expect(events.count()).toBe(4);
  });

  it('logs an error of a handler', async () => {
    const { connection } = createConnection();
    runtime.addHandler('PROVIDER_READY', async () => {
      throw new Error('Oops');
    });

    await defineFlag({ key: 'a', connection })();
    await vi.waitFor(() =>
      expect(console.error).toHaveBeenCalledWith(
        'flags: An event handler failed.',
        expect.any(Error),
      ),
    );
  });
});
