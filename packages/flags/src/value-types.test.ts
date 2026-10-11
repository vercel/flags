import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { base64url } from 'jose';
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
import { evaluate } from './evaluate';
import { defineFlag } from './flag';
import { encryptOverrides } from './overrides/shared-secret';
import { runtime } from './runtime';
import type { Provider } from './types';
import type { FlagObjectValue } from './value-types';

const flagValues = {
  'banner-text': {
    variants: { welcome: 'Welcome', sale: 'Sale!' },
    defaultVariant: 'sale',
    disabled: false,
  },
  'max-items': {
    variants: { few: 3, many: 10 },
    defaultVariant: 'many',
    disabled: false,
  },
  checkout: {
    variants: { control: 'control', express: 'express', new: 'one-click' },
    defaultVariant: 'express',
    disabled: false,
  },
  'unknown-checkout': {
    variants: { future: 'future-variant' },
    defaultVariant: 'future',
    disabled: false,
  },
  theme: {
    variants: { blue: { color: 'blue' }, red: { color: 'red' } },
    defaultVariant: 'red',
    disabled: false,
  },
  'summer-sale': {
    variants: { on: true, off: false },
    defaultVariant: 'on',
    disabled: false,
  },
} as const;

const connection = () =>
  defineConnection({
    provider: new TypedInMemoryProvider(flagValues),
    project: { system: 'in-memory' },
  });

let errors: string[];
let warnings: string[];

beforeEach(() => {
  runtime.reset();
  errors = [];
  warnings = [];
  vi.spyOn(console, 'error').mockImplementation((m) => {
    errors.push(String(m));
  });
  vi.spyOn(console, 'warn').mockImplementation((m) => {
    warnings.push(String(m));
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('flag value types', () => {
  it('is a boolean without a type', async () => {
    const flag = defineFlag({ key: 'summer-sale', connection: connection() });

    expect(flag.type).toBe('boolean');
    await expect(flag()).resolves.toBe(true);
    expectTypeOf(flag).returns.resolves.toEqualTypeOf<boolean>();
  });

  it('evaluates a string flag', async () => {
    const flag = defineFlag({
      key: 'banner-text',
      type: 'string',
      connection: connection(),
    });

    await expect(flag()).resolves.toBe('Sale!');
    expectTypeOf(flag).returns.resolves.toEqualTypeOf<string>();
  });

  it('evaluates a number flag', async () => {
    const flag = defineFlag({
      key: 'max-items',
      type: 'number',
      defaultValue: 5,
      connection: connection(),
    });

    await expect(flag()).resolves.toBe(10);
    expectTypeOf(flag).returns.resolves.toEqualTypeOf<number>();
  });

  it('evaluates an object flag', async () => {
    const flag = defineFlag({
      key: 'theme',
      type: 'object',
      connection: connection(),
    });

    await expect(flag()).resolves.toEqual({ color: 'red' });
    expectTypeOf(flag).returns.resolves.toEqualTypeOf<FlagObjectValue>();
  });

  it('gives the types of the flags to evaluate', async () => {
    const c = connection();
    const sale = defineFlag({ key: 'summer-sale', connection: c });
    const text = defineFlag({
      key: 'banner-text',
      type: 'string',
      connection: c,
    });
    const items = defineFlag({
      key: 'max-items',
      type: 'number',
      connection: c,
    });

    const values = await evaluate([sale, text, items]);
    expect(values).toEqual([true, 'Sale!', 10]);
    expectTypeOf(values).toEqualTypeOf<[boolean, string, number]>();
    expectTypeOf(await evaluate(text)).toEqualTypeOf<string>();
    expectTypeOf(
      await evaluate({ key: 'max-items', type: 'number', connection: c }),
    ).toEqualTypeOf<number>();
  });

  describe('options', () => {
    it('makes the type the union of the options', async () => {
      const flag = defineFlag({
        key: 'checkout',
        type: 'string',
        options: ['control', 'express', 'one-click'],
        defaultValue: 'control',
        connection: connection(),
      });

      await expect(flag()).resolves.toBe('express');
      expectTypeOf(flag).returns.resolves.toEqualTypeOf<
        'control' | 'express' | 'one-click'
      >();
    });

    it('accepts options with labels, and keeps them on the flag', () => {
      const flag = defineFlag({
        key: 'checkout',
        type: 'string',
        options: [
          { value: 'control', label: 'Control' },
          { value: 'express', label: 'Express checkout' },
        ],
        connection: connection(),
      });

      expect(flag.options).toEqual([
        { value: 'control', label: 'Control' },
        { value: 'express', label: 'Express checkout' },
      ]);
      expectTypeOf(flag).returns.resolves.toEqualTypeOf<
        'control' | 'express'
      >();
    });

    it('gives options of plain values as objects with a value', () => {
      const flag = defineFlag({
        key: 'summer-sale',
        options: [true, false],
        connection: connection(),
      });

      expect(flag.options).toEqual([{ value: true }, { value: false }]);
    });

    it('fails for a value which is not one of the options', async () => {
      const flag = defineFlag({
        key: 'unknown-checkout',
        type: 'string',
        options: ['control', 'express'],
        defaultValue: 'control',
        connection: connection(),
      });

      await expect(flag()).resolves.toBe('control');
      expect(errors).toEqual([
        'flags: Could not evaluate flag "unknown-checkout": The value is not one of the options: the string "future-variant". Returned the default value: "control".',
      ]);
    });

    it('compares object options by their content', async () => {
      const flag = defineFlag({
        key: 'theme',
        type: 'object',
        options: [{ value: { color: 'blue' } }, { value: { color: 'red' } }],
        connection: connection(),
      });

      await expect(flag()).resolves.toEqual({ color: 'red' });
    });

    it('requires objects with a value for object flags', () => {
      expect(() =>
        // @ts-expect-error an object flag needs { value }
        defineFlag({
          key: 'theme',
          type: 'object',
          options: [{ color: 'blue' }],
          connection: connection(),
        }),
      ).toThrow(
        'flags: The options of flag "theme" must be objects with a value, e.g. { value: { color: \'blue\' } }, because the flag has the type object.',
      );
    });
  });

  describe('errors', () => {
    it('fails for a value of a different type', async () => {
      // A provider which does not examine the type itself
      const provider: Provider = {
        metadata: { name: 'test' },
        resolveBooleanEvaluation: async () => ({ value: true }),
        resolveNumberEvaluation: async () => ({
          value: 'many' as unknown as number,
        }),
      };
      const flag = defineFlag({
        key: 'max-items',
        type: 'number',
        defaultValue: 0,
        connection: defineConnection({
          provider,
          project: { system: 'in-memory' },
        }),
      });

      await expect(flag()).resolves.toBe(0);
      expect(errors).toEqual([
        'flags: Could not evaluate flag "max-items": Expected a number, got string. Returned the default value: 0.',
      ]);
    });

    it('uses the error code when the error of the provider has no message', async () => {
      // TypedInMemoryProvider examines the type itself, without a message
      const flag = defineFlag({
        key: 'banner-text',
        type: 'number',
        connection: connection(),
      });

      await expect(flag()).rejects.toMatchObject({
        code: 'TYPE_MISMATCH',
        message: 'flags: Could not evaluate flag "banner-text": TYPE_MISMATCH',
      });
    });

    it('fails for a provider which does not support the type', async () => {
      const onlyBoolean: Provider = {
        metadata: { name: 'only-boolean' },
        resolveBooleanEvaluation: async () => ({ value: true }),
      };
      const flag = defineFlag({
        key: 'a',
        type: 'string',
        connection: defineConnection({
          provider: onlyBoolean,
          project: { system: 'in-memory' },
        }),
      });

      await expect(flag()).rejects.toMatchObject({
        message:
          'flags: Could not evaluate flag "a": The provider "only-boolean" does not support string flags.',
      });
    });

    it('throws for a type which does not exist', () => {
      expect(() =>
        // @ts-expect-error not a type
        defineFlag({
          key: 'a',
          type: 'date',
          connection: connection(),
        }),
      ).toThrow(
        'flags: The type of flag "a" must be boolean, string, number or object.',
      );
    });
  });

  describe('the placeholder without defaultValue', () => {
    it.each([
      ['boolean', false],
      ['string', ''],
      ['number', 0],
      ['object', {}],
    ] as const)('is %s for %s flags', async (type, placeholder) => {
      const resolve = vi.fn(async () => ({ value: placeholder }));
      const provider: Provider = {
        metadata: { name: 'test' },
        resolveBooleanEvaluation: resolve as never,
        resolveStringEvaluation: resolve as never,
        resolveNumberEvaluation: resolve as never,
        resolveObjectEvaluation: resolve as never,
      };
      await defineFlag({
        key: 'a',
        type,
        connection: defineConnection({
          provider,
          project: { system: 'in-memory' },
        }),
      })();

      expect((resolve.mock.calls[0] as unknown[])[1]).toEqual(placeholder);
    });
  });

  describe('without a type', () => {
    it('warns about a defaultValue which is not a boolean', () => {
      // @ts-expect-error a flag without a type is a boolean
      defineFlag({
        key: 'banner-text',
        defaultValue: 'Welcome',
        connection: connection(),
      });

      expect(warnings).toEqual([
        'flags: The defaultValue of flag "banner-text" is not a boolean. Set type to use a different type.',
      ]);
    });

    it('warns about options which are not booleans', () => {
      // @ts-expect-error a flag without a type is a boolean
      defineFlag({
        key: 'checkout',
        options: ['control', 'express'],
        connection: connection(),
      });

      expect(warnings).toEqual([
        'flags: An option of flag "checkout" is not a boolean. Set type to use a different type.',
      ]);
    });
  });

  describe('type errors', () => {
    it('requires a defaultValue of the type', () => {
      void (() => {
        // @ts-expect-error a number flag needs a number
        defineFlag({ key: 'a', type: 'number', defaultValue: 'x' });
        // @ts-expect-error the defaultValue must be one of the options
        defineFlag({
          key: 'a',
          type: 'string',
          options: ['a', 'b'],
          defaultValue: 'c',
        });
        // @ts-expect-error the options must have the type of the flag
        defineFlag({ key: 'a', type: 'number', options: ['a'] });
      });
    });

    it('warns at runtime about the same problems', () => {
      // @ts-expect-error the defaultValue must be one of the options
      defineFlag({
        key: 'a',
        type: 'string',
        options: ['a', 'b'],
        defaultValue: 'c',
        connection: connection(),
      });

      expect(warnings).toEqual([
        'flags: The defaultValue of flag "a" is not one of its options.',
      ]);
    });
  });

  describe('overrides', () => {
    const secret = base64url.encode(crypto.getRandomValues(new Uint8Array(32)));

    async function withOverride(
      overrides: Record<string, unknown>,
      evaluateFlag: () => Promise<unknown>,
    ) {
      vi.stubEnv('FLAGS_SECRET', secret);
      const token = await encryptOverrides(overrides as never, secret);
      return runtime.onInvoke(
        new Request('https://shop.example', {
          headers: { cookie: `flag-overrides=${token}` },
        }),
        evaluateFlag,
      );
    }

    it('accepts an override of the type', async () => {
      const flag = defineFlag({
        key: 'banner-text',
        type: 'string',
        connection: connection(),
      });

      await expect(
        withOverride({ 'banner-text': 'Override' }, () => flag()),
      ).resolves.toBe('Override');
    });

    it('ignores an override of a different type', async () => {
      const flag = defineFlag({
        key: 'max-items',
        type: 'number',
        connection: connection(),
      });

      await expect(
        withOverride({ 'max-items': 'many' }, () => flag()),
      ).resolves.toBe(10);
      expect(warnings).toEqual([
        'flags: The override of flag "max-items" was ignored, because it is not a number.',
      ]);
    });

    it('ignores an override which is not one of the options', async () => {
      const flag = defineFlag({
        key: 'checkout',
        type: 'string',
        options: ['control', 'express', 'one-click'],
        connection: connection(),
      });

      await expect(
        withOverride({ checkout: 'unknown' }, () => flag()),
      ).resolves.toBe('express');
      expect(warnings).toEqual([
        'flags: The override of flag "checkout" was ignored, because it is not one of the options.',
      ]);
    });
  });
});
