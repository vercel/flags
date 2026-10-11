import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Two copies of the SDK in one process, e.g. the copy of the build tool
// without the alias of flags/framework, and the copy in the server code with
// the binding. vi.resetModules() loads the modules again, so each import of
// ./runtime is a new copy. globalThis stays the same, as in one process.
const stateKey = Symbol.for('flags.v5.state');
const store = globalThis as unknown as Record<symbol, unknown>;

async function loadCopy(setupFramework: unknown) {
  vi.resetModules();
  vi.doMock('flags/framework', () => ({ setupFramework }));
  return import('./runtime');
}

describe('the framework binding of several copies', () => {
  let saved: unknown;

  beforeEach(() => {
    saved = store[stateKey];
    delete store[stateKey];
  });

  afterEach(() => {
    vi.doUnmock('flags/framework');
    vi.resetModules();
    store[stateKey] = saved;
  });

  it('uses the binding of a copy which is loaded later', async () => {
    const setup = vi.fn();
    const withoutBinding = await loadCopy(undefined);
    const withBinding = await loadCopy(setup);

    // One runtime, which the first copy created
    expect(withBinding.runtime).toBe(withoutBinding.runtime);
    await withoutBinding.runtime.prepare();
    expect(setup).toHaveBeenCalledWith(withoutBinding.runtime);
  });

  it('finds the binding also after a call without one', async () => {
    const setup = vi.fn();
    const first = await loadCopy(undefined);
    // e.g. the plugin calls prepare() before the server code is loaded
    await first.runtime.prepare();

    await loadCopy(setup);
    await first.runtime.prepare();
    expect(setup).toHaveBeenCalledOnce();
  });

  it('keeps the binding of the first copy which has one', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const copy = await loadCopy(first);
    await loadCopy(second);

    await copy.runtime.prepare();
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });
});
