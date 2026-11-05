import { describe, expect, it } from 'vitest';
import {
  deserialize,
  MAX_OPTION_LENGTH,
  serialize,
} from './serialization';

const secret = 'a'.repeat(43);

describe('serialization', () => {
  it('should serialize and deserialize standard flag values', async () => {
    const flags = [
      { key: 'flagA', options: [{ label: 'on', value: 'yes' }, { label: 'off', value: 'no' }] },
      { key: 'flagB', options: [{ label: 'active', value: true }] },
      { key: 'flagC', options: [{ label: 'none', value: null }] },
    ];

    const values = { flagA: 'yes', flagB: true, flagC: null };
    const serialized = await serialize(values, flags, secret);
    const deserialized = await deserialize(serialized, flags, secret);

    expect(deserialized).toEqual(values);
  });

  it('should handle unlisted values', async () => {
    const flags = [
      { key: 'flagA', options: [{ label: 'opt1', value: 'val1' }] },
    ];

    const values = { flagA: 'customValue' };
    const serialized = await serialize(values, flags, secret);
    const deserialized = await deserialize(serialized, flags, secret);

    expect(deserialized).toEqual(values);
  });

  it('should correctly handle option index >= MAX_OPTION_LENGTH without SPECIAL_INTEGERS collision', async () => {
    // Generate 300 options
    const options = Array.from({ length: 300 }, (_, i) => ({
      label: `Option ${i}`,
      value: `value_${i}`,
    }));

    const flags = [{ key: 'largeFlag', options }];

    // Test option within range (< 252)
    const val0 = { largeFlag: 'value_0' };
    const code0 = await serialize(val0, flags, secret);
    expect(await deserialize(code0, flags, secret)).toEqual(val0);

    const val251 = { largeFlag: 'value_251' };
    const code251 = await serialize(val251, flags, secret);
    expect(await deserialize(code251, flags, secret)).toEqual(val251);

    // Test option at index 252 (MAX_OPTION_LENGTH), which would otherwise collide with SPECIAL_INTEGERS.NULL
    const val252 = { largeFlag: 'value_252' };
    const code252 = await serialize(val252, flags, secret);
    expect(await deserialize(code252, flags, secret)).toEqual(val252);

    // Test option at index 253 (would collide with SPECIAL_INTEGERS.BOOLEAN_FALSE)
    const val253 = { largeFlag: 'value_253' };
    const code253 = await serialize(val253, flags, secret);
    expect(await deserialize(code253, flags, secret)).toEqual(val253);

    // Test option at index 254 (would collide with SPECIAL_INTEGERS.BOOLEAN_TRUE)
    const val254 = { largeFlag: 'value_254' };
    const code254 = await serialize(val254, flags, secret);
    expect(await deserialize(code254, flags, secret)).toEqual(val254);

    // Test option at index 255 (would collide with SPECIAL_INTEGERS.UNLISTED_VALUE)
    const val255 = { largeFlag: 'value_255' };
    const code255 = await serialize(val255, flags, secret);
    expect(await deserialize(code255, flags, secret)).toEqual(val255);

    // Test option at index 299 (beyond 255)
    const val299 = { largeFlag: 'value_299' };
    const code299 = await serialize(val299, flags, secret);
    expect(await deserialize(code299, flags, secret)).toEqual(val299);
  });
});
