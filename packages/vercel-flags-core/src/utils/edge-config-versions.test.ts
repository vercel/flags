import { afterEach, describe, expect, it } from 'vitest';
import { setRequestContext } from '../test-utils';
import {
  EDGE_CONFIG_VERSIONS_HEADER,
  flagsConfigVersionKey,
  parseFlagsConfigVersion,
  readFlagsConfigVersion,
} from './edge-config-versions';

describe('flagsConfigVersionKey', () => {
  it('should key entries by project id', () => {
    expect(flagsConfigVersionKey('prj_123')).toBe('flags_prj_123');
  });
});

describe('parseFlagsConfigVersion', () => {
  it('should read the entry for the given project', () => {
    expect(
      parseFlagsConfigVersion('flags_prj_123=1726434400000', 'prj_123'),
    ).toBe(1726434400000);
  });

  it('should read the entry from a list of semicolon-separated entries', () => {
    expect(
      parseFlagsConfigVersion(
        'ecfg_abc=1726434395818;flags_prj_123=1726434400000;ecfg_def=1726434300000',
        'prj_123',
      ),
    ).toBe(1726434400000);
  });

  it('should tolerate whitespace around entries', () => {
    expect(
      parseFlagsConfigVersion(
        'ecfg_abc=1 ; flags_prj_123 = 1726434400000 ',
        'prj_123',
      ),
    ).toBe(1726434400000);
  });

  it('should return undefined when the header is missing', () => {
    expect(parseFlagsConfigVersion(undefined, 'prj_123')).toBeUndefined();
  });

  it('should return undefined for an empty header', () => {
    expect(parseFlagsConfigVersion('', 'prj_123')).toBeUndefined();
  });

  it('should return undefined when there is no entry for the project', () => {
    expect(
      parseFlagsConfigVersion(
        'ecfg_abc=1726434395818;flags_prj_other=1726434400000',
        'prj_123',
      ),
    ).toBeUndefined();
  });

  it('should not match a project id by prefix', () => {
    expect(
      parseFlagsConfigVersion('flags_prj_1234=1726434400000', 'prj_123'),
    ).toBeUndefined();
  });

  it('should return undefined for a non-numeric value', () => {
    expect(parseFlagsConfigVersion('flags_prj_123=nil', 'prj_123')).toBe(
      undefined,
    );
  });

  it('should return undefined for a missing value', () => {
    expect(
      parseFlagsConfigVersion('flags_prj_123=', 'prj_123'),
    ).toBeUndefined();
  });

  it('should return undefined for an entry without a separator', () => {
    expect(parseFlagsConfigVersion('flags_prj_123', 'prj_123')).toBeUndefined();
  });

  it('should return undefined for a non-positive value', () => {
    expect(
      parseFlagsConfigVersion('flags_prj_123=0', 'prj_123'),
    ).toBeUndefined();
    expect(
      parseFlagsConfigVersion('flags_prj_123=-1', 'prj_123'),
    ).toBeUndefined();
  });

  it('should return undefined for Infinity', () => {
    expect(
      parseFlagsConfigVersion('flags_prj_123=Infinity', 'prj_123'),
    ).toBeUndefined();
  });
});

describe('readFlagsConfigVersion', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('should read the version from the request context headers', () => {
    cleanup = setRequestContext({
      [EDGE_CONFIG_VERSIONS_HEADER]: 'flags_prj_123=1726434400000',
    });

    expect(readFlagsConfigVersion('prj_123')).toBe(1726434400000);
  });

  it('should return undefined when the header is absent', () => {
    cleanup = setRequestContext({ 'x-vercel-id': 'abc' });

    expect(readFlagsConfigVersion('prj_123')).toBeUndefined();
  });

  it('should return undefined without a request context', () => {
    expect(readFlagsConfigVersion('prj_123')).toBeUndefined();
  });
});
