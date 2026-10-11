import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineConnection } from './connection';
import { defineFlag } from './flag';
import { runtime } from './runtime';

// What a framework plugin does: an alias replaces flags/framework
const setup = vi.fn();
vi.mock('flags/framework', () => ({
  setupFramework: (r: unknown) => setup(r),
}));

const connection = () =>
  defineConnection({
    provider: {
      metadata: { name: 'test' },
      resolveBooleanEvaluation: async () => ({ value: true }),
    },
    project: { system: 'in-memory' },
  });

describe('flags/framework replaced by a framework', () => {
  beforeEach(() => {
    runtime.reset();
    setup.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is called with the runtime before the first evaluation', async () => {
    const order: string[] = [];
    setup.mockImplementation(() => {
      order.push('setup');
    });
    const provider = {
      metadata: { name: 'test' },
      resolveBooleanEvaluation: async () => {
        order.push('evaluate');
        return { value: true };
      },
    };
    const flag = defineFlag({
      key: 'a',
      connection: defineConnection({
        provider,
        project: { system: 'in-memory' },
      }),
    });

    await flag();
    expect(order).toEqual(['setup', 'evaluate']);
    expect(setup).toHaveBeenCalledWith(runtime);
  });

  it('is called one time', async () => {
    const flag = defineFlag({ key: 'a', connection: connection() });

    await Promise.all([flag(), flag()]);
    await flag();
    expect(setup).toHaveBeenCalledTimes(1);
  });

  it('can configure the runtime before the evaluation', async () => {
    const configured = connection();
    setup.mockImplementation((r: typeof runtime) => {
      r.configure({ defaultConnection: configured });
    });

    const flag = defineFlag({ key: 'a' });
    await flag();
    expect(flag.connection).toBe(configured);
  });

  it('fails the evaluation and tries again after an error', async () => {
    setup.mockRejectedValueOnce(new Error('flags.config.ts has an error'));
    const flag = defineFlag({ key: 'a', connection: connection() });

    await expect(flag()).rejects.toThrow('flags.config.ts has an error');
    await expect(flag()).resolves.toBe(true);
    expect(setup).toHaveBeenCalledTimes(2);
  });

  it('is called by onInit, which logs an error', async () => {
    setup.mockRejectedValueOnce(new Error('Oops'));

    await runtime.onInit();
    expect(setup).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      'flags: Could not set up the framework binding.',
      expect.any(Error),
    );
  });
});
