import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FrameworkBinding } from './framework';

const binding = (name: string): FrameworkBinding => ({
  name,
  getHeaders: async () => {
    throw new Error('not used');
  },
  getRequest: async () => {
    throw new Error('not used');
  },
  isFrameworkSignal: () => false,
});

/** A new copy of the module, as a bundler can make for each layer. */
async function loadCopy() {
  vi.resetModules();
  return import('./framework');
}

afterEach(async () => {
  (await loadCopy()).setFramework(undefined);
});

describe('the framework binding', () => {
  it('is the binding of the entry without a supplied binding', async () => {
    const { getFramework } = await loadCopy();
    const entry = binding('entry');

    expect(getFramework(entry)).toBe(entry);
  });

  it('prefers a supplied binding to the binding of the entry', async () => {
    const { getFramework, setFramework } = await loadCopy();
    const supplied = binding('supplied');
    setFramework(supplied);

    expect(getFramework(binding('entry'))).toBe(supplied);
  });

  it('is shared by all copies of the package in one process', async () => {
    const a = await loadCopy();
    const b = await loadCopy();
    const supplied = binding('supplied');

    a.setFramework(supplied);

    expect(a.getFramework).not.toBe(b.getFramework);
    expect(b.getFramework(binding('entry'))).toBe(supplied);
  });
});
