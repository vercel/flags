import { describe, expect, it } from 'vitest';
import { flag } from './flag';
import { createManifest, validateFlagsManifest } from './manifest';

describe('createManifest', () => {
  it('describes the flags of flag(), sorted by key', () => {
    const summerSale = flag<boolean>({
      key: 'summer-sale',
      description: 'Shows the summer sale banner',
      defaultValue: false,
      options: [false, true],
      decide: () => true,
    });
    const bannerText = flag<string>({
      key: 'banner-text',
      options: [
        { value: 'Welcome', label: 'Default' },
        { value: 'Summer sale!' },
      ],
      decide: () => 'Welcome',
    });

    const manifest = createManifest([
      { id: 'flags.ts', exports: { summerSale, bannerText } },
    ]);

    expect(manifest).toEqual({
      version: 1,
      sources: {},
      definitions: {
        'banner-text': {
          type: 'string',
          options: [
            { value: 'Welcome', label: 'Default' },
            { value: 'Summer sale!' },
          ],
          declaredInCode: true,
          declarations: [{ module: 'flags.ts', export: 'bannerText' }],
        },
        'summer-sale': {
          type: 'boolean',
          options: [{ value: false }, { value: true }],
          defaultValue: false,
          description: 'Shows the summer sale banner',
          declaredInCode: true,
          declarations: [{ module: 'flags.ts', export: 'summerSale' }],
        },
      },
    });
    expect(Object.keys(manifest.definitions)).toEqual([
      'banner-text',
      'summer-sale',
    ]);
    expect(validateFlagsManifest(manifest)).toBe(manifest);
  });

  it('does not evaluate the flags', () => {
    let calls = 0;
    const counted = flag<boolean>({
      key: 'counted',
      decide: () => {
        calls++;
        return true;
      },
    });

    createManifest([{ id: 'flags.ts', exports: { counted } }]);

    expect(calls).toBe(0);
  });

  it('leaves out the type when the flag does not show it', () => {
    const withoutValues = flag<string>({ key: 'plain', decide: () => 'a' });
    const mixed = { key: 'mixed', options: ['a', 1] };

    const { definitions } = createManifest([
      { id: 'flags.ts', exports: { withoutValues, mixed } },
    ]);

    expect(definitions.plain).toEqual({
      declaredInCode: true,
      declarations: [{ module: 'flags.ts', export: 'withoutValues' }],
    });
    expect(definitions.mixed?.type).toBeUndefined();
  });

  it('accepts a plain object with a key', () => {
    const { definitions } = createManifest([
      { id: 'flags.ts', exports: { plain: { key: 'plain', defaultValue: 3 } } },
    ]);

    expect(definitions.plain?.type).toBe('number');
  });

  it('throws if an export is not a flag', () => {
    expect(() =>
      createManifest([{ id: 'flags.ts', exports: { all: [1, 2] } }]),
    ).toThrow(
      `Export "all" of flags.ts is not a flag. A module with 'use flags' exports only flags.`,
    );
  });

  it('merges the declarations of the same flag', () => {
    const banner = flag<boolean>({ key: 'banner', decide: () => true });

    const { definitions } = createManifest([
      { id: 'a.ts', exports: { banner } },
      { id: 'b.ts', exports: { banner, alias: banner } },
    ]);

    expect(definitions.banner?.declarations).toEqual([
      { module: 'a.ts', export: 'banner' },
      { module: 'b.ts', export: 'banner' },
      { module: 'b.ts', export: 'alias' },
    ]);
  });

  it('throws if two exports declare different flags with the same key', () => {
    expect(() =>
      createManifest([
        { id: 'a.ts', exports: { a: { key: 'banner', defaultValue: true } } },
        { id: 'b.ts', exports: { b: { key: 'banner', defaultValue: 'x' } } },
      ]),
    ).toThrow(
      'Flag "banner" is declared two times with different values: export "a" of a.ts, and export "b" of b.ts.',
    );
  });

  it('throws for options which are not an array', () => {
    expect(() =>
      createManifest([
        { id: 'flags.ts', exports: { a: { key: 'a', options: 'yes' } } },
      ]),
    ).toThrow(
      'The options of flag "a" (export "a" of flags.ts) must be an array.',
    );
  });
});

describe('validateFlagsManifest', () => {
  it.each([
    [null, 'it is not an object.'],
    [{ version: 2, sources: {}, definitions: {} }, 'the version is not 1.'],
    [{ version: 1, definitions: {} }, 'sources is missing.'],
    [
      {
        version: 1,
        sources: {},
        definitions: {
          b: { declaredInCode: true, declarations: [] },
          a: { declaredInCode: true, declarations: [] },
        },
      },
      'the definitions are not sorted by key.',
    ],
    [
      {
        version: 1,
        sources: {},
        definitions: { a: { declaredInCode: true, declarations: [] } },
      },
      'flag "a" has no valid declarations.',
    ],
  ])('rejects %j', (value, message) => {
    expect(() => validateFlagsManifest(value)).toThrow(message);
  });
});
