import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import { defineConnection } from './connection';
import { getBuiltInConnection } from './default-connection';
import { defineFlag } from './flag';
import { runtime } from './runtime';
import type { FlagObjectValue } from './value-types';

const connection = () =>
  defineConnection({
    provider: new TypedInMemoryProvider({
      'summer-sale': {
        variants: { on: true, off: false },
        defaultVariant: 'on',
        disabled: false,
      },
      'banner-text': {
        variants: { welcome: 'Welcome', sale: 'Summer sale!' },
        defaultVariant: 'sale',
        disabled: false,
      },
      'max-items': {
        variants: { few: 3, many: 10 },
        defaultVariant: 'many',
        disabled: false,
      },
      theme: {
        variants: { dark: { color: 'black' } },
        defaultVariant: 'dark',
        disabled: false,
      },
    } as const),
    project: { system: 'in-memory' },
  });

beforeEach(() => {
  runtime.reset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('short forms of defineFlag', () => {
  describe('defineFlag(key)', () => {
    it('declares a boolean flag of the default connection', () => {
      const flag = defineFlag('summer-sale');

      expect(flag.key).toBe('summer-sale');
      expect(flag.type).toBe('boolean');
      expect(flag.defaultValue).toBeUndefined();
      expect(flag.connection).toBe(getBuiltInConnection());
      expectTypeOf(flag.key).toEqualTypeOf<'summer-sale'>();
      expectTypeOf(flag).returns.resolves.toEqualTypeOf<boolean>();
    });

    it('evaluates with the configured default connection', async () => {
      runtime.configure({ defaultConnection: connection() });

      await expect(defineFlag('summer-sale')()).resolves.toBe(true);
    });
  });

  describe('defineFlag(key, defaultValue)', () => {
    it.each([
      ['summer-sale', false, 'boolean', true],
      ['banner-text', 'Welcome', 'string', 'Summer sale!'],
      ['max-items', 5, 'number', 10],
      ['theme', { color: 'white' }, 'object', { color: 'black' }],
    ] as const)('takes the type of %s from the default value', async (key, defaultValue, type, value) => {
      runtime.configure({ defaultConnection: connection() });
      const flag = defineFlag(key, defaultValue);

      expect(flag.type).toBe(type);
      expect(flag.defaultValue).toEqual(defaultValue);
      await expect(flag()).resolves.toEqual(value);
    });

    it('gives the general type of the default value', () => {
      expectTypeOf(
        defineFlag('a', true),
      ).returns.resolves.toEqualTypeOf<boolean>();
      expectTypeOf(
        defineFlag('a', 'Welcome'),
      ).returns.resolves.toEqualTypeOf<string>();
      expectTypeOf(defineFlag('a', 5)).returns.resolves.toEqualTypeOf<number>();
      expectTypeOf(
        defineFlag('a', { color: 'white' }),
      ).returns.resolves.toEqualTypeOf<FlagObjectValue>();
    });

    it('returns the default value when the evaluation fails', async () => {
      runtime.configure({ defaultConnection: connection() });

      await expect(defineFlag('missing', 'Fallback')()).resolves.toBe(
        'Fallback',
      );
    });

    it('declares a boolean flag without a default for undefined', () => {
      const flag = defineFlag('summer-sale', undefined as unknown as boolean);

      expect(flag.type).toBe('boolean');
      expect(flag.defaultValue).toBeUndefined();
    });
  });

  describe('defineFlag(connection, key)', () => {
    it('declares a boolean flag of the connection', async () => {
      const c = connection();
      const flag = defineFlag(c, 'summer-sale');

      expect(flag.connection).toBe(c);
      expect(flag.type).toBe('boolean');
      await expect(flag()).resolves.toBe(true);
      expectTypeOf(flag.connection).toEqualTypeOf(c);
    });
  });

  describe('defineFlag(connection, key, defaultValue)', () => {
    it('declares a flag of the connection with the type of the default', async () => {
      const c = connection();
      const flag = defineFlag(c, 'max-items', 5);

      expect(flag.connection).toBe(c);
      expect(flag.type).toBe('number');
      await expect(flag()).resolves.toBe(10);
      expectTypeOf(flag).returns.resolves.toEqualTypeOf<number>();
    });
  });

  it('gives the same flag as the full form', async () => {
    const c = connection();
    const short = defineFlag(c, 'banner-text', 'Welcome');
    const full = defineFlag({
      key: 'banner-text',
      type: 'string',
      defaultValue: 'Welcome',
      connection: c,
    });

    expect({ ...short }).toEqual({ ...full });
    await expect(short()).resolves.toBe(await full());
  });

  describe('errors', () => {
    it('throws for a default value of a type which does not exist', () => {
      expect(() =>
        // @ts-expect-error a function is not a value of a flag
        defineFlag('a', () => true),
      ).toThrow(
        'flags: The defaultValue of flag "a" must be a boolean, a string, a number or an object.',
      );
    });

    it('throws for a connection without a key', () => {
      // @ts-expect-error the key is missing
      expect(() => defineFlag(connection(), 1)).toThrow(
        'flags: The key of a flag must be a string.',
      );
    });

    it('throws for an argument which is not a key, a connection or options', () => {
      // @ts-expect-error a number is not a key
      expect(() => defineFlag(1)).toThrow(
        'flags: defineFlag expects a key, a connection and a key, or options.',
      );
    });

    it('requires a connection returned by defineConnection', () => {
      const fake = {
        provider: new TypedInMemoryProvider({}),
        project: { system: 'in-memory' as const },
      };

      // The types accept the fake object, because a connection is structural
      expect(() => defineFlag(fake, 'a')).toThrow(
        'flags: The connection of a flag must be returned by defineConnection.',
      );
    });

    it('requires a key in the full form', () => {
      // @ts-expect-error the key is missing
      expect(() => defineFlag({ type: 'string' })).toThrow(
        'flags: The key of a flag must be a string.',
      );
    });
  });
});
