import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Connection, defineConnection } from './connection';
import { defineFlag } from './flag';
import { registerConnections, registerFlags } from './register';
import { runtime } from './runtime';

function createConnection() {
  return defineConnection({
    provider: new TypedInMemoryProvider({}),
    project: { system: 'in-memory' },
  });
}

describe('registerConnections', () => {
  beforeEach(() => runtime.reset());

  it('registers connections', () => {
    const a = createConnection();
    const b = createConnection();
    registerConnections([a, b]);

    expect([...runtime.connections]).toEqual([a, b]);
  });

  it('accepts any iterable', () => {
    const a = createConnection();
    registerConnections(new Set([a]));

    expect(runtime.connections).toContain(a);
  });

  it('registers a connection once', () => {
    const a = createConnection();
    registerConnections([a, a]);
    registerConnections([a]);

    expect(runtime.connections.size).toBe(1);
  });

  it('only accepts connections returned by defineConnection', () => {
    const fake = {
      provider: new TypedInMemoryProvider({}),
      project: { system: 'in-memory' },
    } as Connection;

    expect(() => registerConnections([fake])).toThrow(
      'flags: registerConnections only accepts connections returned by defineConnection.',
    );
  });
});

describe('registerFlags', () => {
  beforeEach(() => runtime.reset());

  it('registers the connections of all exported flags', () => {
    const a = createConnection();
    const b = createConnection();
    const flagA = defineFlag({ key: 'a', connection: a });
    const flagB = defineFlag({ key: 'b', connection: b });
    // Defining flags already registers their connections
    runtime.reset();

    registerFlags({ flagA, flagB });
    expect([...runtime.connections]).toEqual([a, b]);
  });

  it('accepts a module namespace object', async () => {
    const connection = createConnection();
    const moduleExports = Object.freeze(
      Object.create(null, {
        myFlag: {
          enumerable: true,
          value: defineFlag({ key: 'a', connection }),
        },
        [Symbol.toStringTag]: { value: 'Module' },
      }),
    ) as Record<string, unknown>;
    runtime.reset();

    registerFlags(moduleExports);
    expect([...runtime.connections]).toEqual([connection]);
  });

  it('throws when an export is not a flag', () => {
    const connection = createConnection();
    const myFlag = defineFlag({ key: 'a', connection });

    runtime.reset();

    expect(() => registerFlags({ myFlag, helper: () => true })).toThrow(
      'flags: registerFlags expects only flags, but export "helper" is not a flag.',
    );
    expect(runtime.connections.size).toBe(0);
  });
});
