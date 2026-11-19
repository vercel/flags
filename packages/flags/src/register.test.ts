import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { defineFlag } from './flag';
import { registerFlags, registerSources } from './register';
import { runtime } from './runtime';
import { defineSource, type Source } from './source';

function createSource() {
  return defineSource({
    provider: new TypedInMemoryProvider({}),
    project: { system: 'in-memory' },
  });
}

describe('registerSources', () => {
  beforeEach(() => runtime.reset());

  it('registers sources', () => {
    const a = createSource();
    const b = createSource();
    registerSources([a, b]);

    expect([...runtime.sources]).toEqual([a, b]);
  });

  it('accepts any iterable', () => {
    const a = createSource();
    registerSources(new Set([a]));

    expect(runtime.sources).toContain(a);
  });

  it('registers a source once', () => {
    const a = createSource();
    registerSources([a, a]);
    registerSources([a]);

    expect(runtime.sources.size).toBe(1);
  });

  it('only accepts sources returned by defineSource', () => {
    const fake = {
      provider: new TypedInMemoryProvider({}),
      project: { system: 'in-memory' },
    } as Source;

    expect(() => registerSources([fake])).toThrow(
      'flags: registerSources only accepts sources returned by defineSource.',
    );
  });
});

describe('registerFlags', () => {
  beforeEach(() => runtime.reset());

  it('registers the sources of all exported flags', () => {
    const a = createSource();
    const b = createSource();
    const flagA = defineFlag({ key: 'a', source: a });
    const flagB = defineFlag({ key: 'b', source: b });
    // Defining flags already registers their sources
    runtime.reset();

    registerFlags({ flagA, flagB });
    expect([...runtime.sources]).toEqual([a, b]);
  });

  it('accepts a module namespace object', async () => {
    const source = createSource();
    const moduleExports = Object.freeze(
      Object.create(null, {
        myFlag: {
          enumerable: true,
          value: defineFlag({ key: 'a', source }),
        },
        [Symbol.toStringTag]: { value: 'Module' },
      }),
    ) as Record<string, unknown>;
    runtime.reset();

    registerFlags(moduleExports);
    expect([...runtime.sources]).toEqual([source]);
  });

  it('throws when an export is not a flag', () => {
    const source = createSource();
    const myFlag = defineFlag({ key: 'a', source });

    runtime.reset();

    expect(() => registerFlags({ myFlag, helper: () => true })).toThrow(
      'flags: registerFlags expects only flags, but export "helper" is not a flag.',
    );
    expect(runtime.sources.size).toBe(0);
  });
});
