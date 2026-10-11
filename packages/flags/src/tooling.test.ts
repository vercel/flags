import { afterEach, describe, expect, it, vi } from 'vitest';
import { runtime } from './runtime';
import { sharedState } from './shared-state';
import { registerFramework } from './tooling';

afterEach(() => {
  delete sharedState.setupFramework;
  runtime.reset();
});

describe('registerFramework', () => {
  it('gives the runtime a binding without the alias', async () => {
    const setup = vi.fn();
    registerFramework(setup);

    await runtime.prepare();
    expect(setup).toHaveBeenCalledWith(runtime);
  });

  it('keeps the first binding', async () => {
    const first = vi.fn();
    const second = vi.fn();
    registerFramework(first);
    registerFramework(second);

    await runtime.prepare();
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });
});
