import { describe, expect, it } from 'vitest';
import { Runtime } from './runtime';
import type { ReadonlyHeaders } from './types';

describe('Runtime', () => {
  it('has no-op lifecycle methods by default', async () => {
    const runtime = new Runtime();
    await expect(runtime.onInit()).resolves.toBeUndefined();
    await expect(
      runtime.onInvoke({ headers: new Headers() }),
    ).resolves.toBeUndefined();
    await expect(runtime.onShutdown()).resolves.toBeUndefined();
  });

  it('calls overridden lifecycle methods', async () => {
    const calls: string[] = [];

    class TestRuntime extends Runtime {
      async onInit() {
        calls.push('init');
      }
      async onInvoke({ headers }: { headers: ReadonlyHeaders }) {
        calls.push(`invoke:${headers.get('x-test')}`);
      }
      async onShutdown() {
        calls.push('shutdown');
      }
    }

    const runtime = new TestRuntime();
    await runtime.onInit();
    await runtime.onInvoke({ headers: new Headers({ 'x-test': 'a' }) });
    await runtime.onInvoke({ headers: new Headers({ 'x-test': 'b' }) });
    await runtime.onShutdown();

    expect(calls).toEqual(['init', 'invoke:a', 'invoke:b', 'shutdown']);
  });

  it('only exposes read methods on headers', async () => {
    class TestRuntime extends Runtime {
      async onInvoke({ headers }: { headers: ReadonlyHeaders }) {
        expect(headers.get('x-test')).toBe('a');
        expect(headers.has('x-test')).toBe(true);
        expect([...headers.entries()]).toEqual([['x-test', 'a']]);
        // @ts-expect-error set is not available on ReadonlyHeaders
        headers.set;
        // @ts-expect-error append is not available on ReadonlyHeaders
        headers.append;
        // @ts-expect-error delete is not available on ReadonlyHeaders
        headers.delete;
      }
    }

    await new TestRuntime().onInvoke({
      headers: new Headers({ 'x-test': 'a' }),
    });
  });
});
