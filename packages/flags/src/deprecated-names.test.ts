import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import {
  type Connection,
  type ConnectionInput,
  defineConnection,
  defineFlag,
  defineSource,
  registerConnections,
  registerFlags,
  registerSources,
  runtime,
  type Source,
  type SourceInput,
} from './index';

// The names of "connection" stay until the end of the move to "source", so
// that the framework packages and the test apps keep working.

const provider = () =>
  new TypedInMemoryProvider({
    a: {
      variants: { on: true, off: false },
      disabled: false,
      defaultVariant: 'on',
    },
  });

afterEach(() => {
  runtime.reset();
});

describe('deprecated connection names', () => {
  it('are the same functions as the source names', () => {
    expect(defineConnection).toBe(defineSource);
    expect(registerConnections).toBe(registerSources);
  });

  it('are the same types as the source names', () => {
    expectTypeOf<Connection>().toEqualTypeOf<Source>();
    expectTypeOf<ConnectionInput<Source>>().toEqualTypeOf<
      SourceInput<Source>
    >();
  });

  it('accept the connection option of a flag', async () => {
    const source = defineSource({
      provider: provider(),
      project: { system: 'in-memory' },
    });
    const flag = defineFlag({ key: 'a', connection: source });

    expect(flag.source).toBe(source);
    expect(flag.connection).toBe(source);
    await expect(flag()).resolves.toBe(true);
  });

  it('accept defaultConnection in the configuration', async () => {
    const source = defineSource({
      provider: provider(),
      project: { system: 'in-memory' },
    });
    runtime.configure({ defaultConnection: source });

    expect(runtime.defaultSource).toBe(source);
    await expect(defineFlag({ key: 'a' })()).resolves.toBe(true);
  });

  it('register the connection of a plain flag object', () => {
    const source = defineSource({
      provider: provider(),
      project: { system: 'in-memory' },
    });
    registerFlags({ a: { key: 'a', connection: source } });

    expect(runtime.sources.has(source)).toBe(true);
  });

  it('accept the old setters of the runtime', async () => {
    runtime.setConfigSource(() => ({
      defaultSource: defineSource({
        provider: provider(),
        project: { system: 'in-memory' },
      }),
    }));
    runtime.setRequestSource(() => ({ headers: new Headers() }));

    await expect(defineFlag({ key: 'a' })()).resolves.toBe(true);
  });
});
