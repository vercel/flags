import { describe, expect, it } from 'vitest';
import {
  EDGE_CONFIG_VERSIONS_HEADER,
  flagsConfigVersionKey,
  parseConfigVersion,
  selectConfigVersion,
} from './edge-config-versions';

describe('EDGE_CONFIG_VERSIONS_HEADER', () => {
  it('should be the lower cased request header name', () => {
    expect(EDGE_CONFIG_VERSIONS_HEADER).toBe('x-vercel-edge-config-versions');
  });
});

describe('flagsConfigVersionKey', () => {
  it('should derive the key from the project id', () => {
    expect(flagsConfigVersionKey('prj_123')).toBe('flags_prj_123');
  });
});

describe('parseConfigVersion', () => {
  it('should parse non-negative integers', () => {
    expect(parseConfigVersion('0')).toBe(0);
    expect(parseConfigVersion('1758000000000')).toBe(1758000000000);
    expect(parseConfigVersion(String(Number.MAX_SAFE_INTEGER))).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it('should reject malformed values', () => {
    expect(parseConfigVersion('')).toBeUndefined();
    expect(parseConfigVersion('abc')).toBeUndefined();
    expect(parseConfigVersion('12abc')).toBeUndefined();
    expect(parseConfigVersion('1 2')).toBeUndefined();
    expect(parseConfigVersion('-1')).toBeUndefined();
    expect(parseConfigVersion('+1')).toBeUndefined();
    expect(parseConfigVersion('1.5')).toBeUndefined();
    expect(parseConfigVersion('1e3')).toBeUndefined();
    expect(parseConfigVersion('0x10')).toBeUndefined();
    expect(parseConfigVersion('NaN')).toBeUndefined();
    expect(parseConfigVersion('Infinity')).toBeUndefined();
  });

  it('should reject values outside the safe integer range', () => {
    expect(parseConfigVersion('9007199254740993')).toBeUndefined();
    expect(parseConfigVersion('1'.repeat(30))).toBeUndefined();
  });
});

describe('selectConfigVersion', () => {
  const key = flagsConfigVersionKey('prj_123');

  it('should select the exact entry', () => {
    expect(selectConfigVersion('flags_prj_123=1758000000000', key)).toEqual({
      status: 'found',
      version: 1758000000000,
    });
  });

  it('should select the exact entry from a map of stores', () => {
    expect(
      selectConfigVersion(
        'ecfg_abc=1757000000000;flags_prj_123=1758000000000;ecfg_def=1',
        key,
      ),
    ).toEqual({ status: 'found', version: 1758000000000 });
  });

  it('should ignore surrounding whitespace and empty segments', () => {
    expect(
      selectConfigVersion(
        ' ecfg_abc=1 ; flags_prj_123 = 1758000000000 ;;',
        key,
      ),
    ).toEqual({ status: 'found', version: 1758000000000 });
  });

  it('should not match keys that merely contain the derived key', () => {
    expect(
      selectConfigVersion(
        'flags_prj_1234=1;xflags_prj_123=2;flags_prj_12=3;flags_prj_123x=4',
        key,
      ),
    ).toEqual({ status: 'not-found' });
  });

  it('should be case sensitive', () => {
    expect(selectConfigVersion('FLAGS_PRJ_123=1758000000000', key)).toEqual({
      status: 'not-found',
    });
  });

  it('should report not-found for a missing header', () => {
    expect(selectConfigVersion(undefined, key)).toEqual({
      status: 'not-found',
    });
    expect(selectConfigVersion('', key)).toEqual({ status: 'not-found' });
  });

  it('should report not-found for an empty key', () => {
    expect(selectConfigVersion('flags_=1758000000000', '')).toEqual({
      status: 'not-found',
    });
  });

  it('should ignore segments without a separator', () => {
    expect(selectConfigVersion('flags_prj_123;ecfg_abc', key)).toEqual({
      status: 'not-found',
    });
  });

  it('should report invalid for a malformed version', () => {
    expect(selectConfigVersion('flags_prj_123=', key)).toEqual({
      status: 'invalid',
    });
    expect(selectConfigVersion('flags_prj_123=later', key)).toEqual({
      status: 'invalid',
    });
    expect(selectConfigVersion('flags_prj_123=-1', key)).toEqual({
      status: 'invalid',
    });
    expect(selectConfigVersion('flags_prj_123=9007199254740993', key)).toEqual({
      status: 'invalid',
    });
  });

  it('should keep the value of an entry containing separators', () => {
    // Only the first `=` separates key from value.
    expect(selectConfigVersion('flags_prj_123=1=2', key)).toEqual({
      status: 'invalid',
    });
  });

  it('should report duplicate entries instead of picking one', () => {
    expect(selectConfigVersion('flags_prj_123=1;flags_prj_123=2', key)).toEqual(
      { status: 'duplicate' },
    );
  });

  it('should report duplicates even when the versions are equal', () => {
    expect(selectConfigVersion('flags_prj_123=1;flags_prj_123=1', key)).toEqual(
      { status: 'duplicate' },
    );
  });

  it('should report duplicates even when one entry is malformed', () => {
    expect(
      selectConfigVersion('flags_prj_123=nope;flags_prj_123=2', key),
    ).toEqual({ status: 'duplicate' });
    expect(
      selectConfigVersion('flags_prj_123=2;flags_prj_123=nope', key),
    ).toEqual({ status: 'duplicate' });
  });
});
