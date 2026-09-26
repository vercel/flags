import { describe, expect, it } from 'vitest';
import {
  isValidProjectId,
  isValidSdkKey,
  parseFlagsConnectionString,
} from './sdk-keys';

describe('parseFlagsConnectionString', () => {
  it('returns a bare SDK key', () => {
    expect(parseFlagsConnectionString('vf_server_abc')).toEqual({
      sdkKey: 'vf_server_abc',
      projectId: null,
    });
  });

  it('returns sdkKey from a flags: string', () => {
    expect(
      parseFlagsConnectionString(
        'flags:edgeConfigId=ecfg_1&sdkKey=vf_server_abc',
      ),
    ).toEqual({ sdkKey: 'vf_server_abc', projectId: null });
  });

  it('returns projectId from a flags: string', () => {
    expect(parseFlagsConnectionString('flags:projectId=prj_abc')).toEqual({
      sdkKey: null,
      projectId: 'prj_abc',
    });
  });

  it('returns both when both are present', () => {
    expect(
      parseFlagsConnectionString(
        'flags:sdkKey=vf_server_abc&projectId=prj_abc',
      ),
    ).toEqual({ sdkKey: 'vf_server_abc', projectId: 'prj_abc' });
  });

  it('returns sdkKey as written and drops empty values', () => {
    expect(
      parseFlagsConnectionString('flags:sdkKey=vf_abc&projectId='),
    ).toEqual({ sdkKey: 'vf_abc', projectId: null });
    expect(parseFlagsConnectionString('flags:sdkKey=&projectId=')).toEqual({
      sdkKey: null,
      projectId: null,
    });
  });

  it('finds sdkKey regardless of position and ignores other params', () => {
    for (const text of [
      'flags:sdkKey=vf_server_k&other=value',
      'flags:other=value&sdkKey=vf_server_k&another=param',
      'flags:edgeConfigId=ecfg_1&edgeConfigToken=tok&teamId=team_a&sdkKey=vf_server_k',
    ]) {
      expect(parseFlagsConnectionString(text)).toEqual({
        sdkKey: 'vf_server_k',
        projectId: null,
      });
    }
  });

  it('returns nulls for a flags: string without sdkKey or projectId', () => {
    expect(
      parseFlagsConnectionString('flags:edgeConfigId=ecfg_1&edgeConfigToken=x'),
    ).toEqual({ sdkKey: null, projectId: null });
  });

  it('returns null for values that are neither', () => {
    expect(parseFlagsConnectionString('')).toBeNull();
    expect(parseFlagsConnectionString('random')).toBeNull();
    expect(parseFlagsConnectionString('vf_abc')).toBeNull();
  });
});

describe('isValidProjectId', () => {
  it('accepts prj_ ids and legacy ids', () => {
    expect(isValidProjectId('prj_abc123XYZ')).toBe(true);
    expect(
      isValidProjectId('Qmc52npNy86S8VV4Mt8a8dP1LEkRNbgosW3pBCQytkcgf2'),
    ).toBe(true);
    expect(isValidProjectId('a'.repeat(64))).toBe(true);
  });

  it('rejects separators, whitespace, and overlong values', () => {
    expect(isValidProjectId('')).toBe(false);
    expect(isValidProjectId('prj_a/b')).toBe(false);
    expect(isValidProjectId('prj_a:b')).toBe(false);
    expect(isValidProjectId('prj_a b')).toBe(false);
    expect(isValidProjectId('prj_a\nb')).toBe(false);
    expect(isValidProjectId('a'.repeat(65))).toBe(false);
  });
});

describe('isValidSdkKey', () => {
  it('should return true for vf_server_ keys', () => {
    expect(isValidSdkKey('vf_server_abc123')).toBe(true);
    expect(isValidSdkKey('vf_server_production_key')).toBe(true);
    expect(isValidSdkKey('vf_server_')).toBe(true);
  });

  it('should return true for vf_client_ keys', () => {
    expect(isValidSdkKey('vf_client_xyz789')).toBe(true);
    expect(isValidSdkKey('vf_client_development')).toBe(true);
    expect(isValidSdkKey('vf_client_')).toBe(true);
  });

  it('should return false for vf_ keys without server_ or client_', () => {
    expect(isValidSdkKey('vf_test_key')).toBe(false);
    expect(isValidSdkKey('vf_abc123')).toBe(false);
    expect(isValidSdkKey('vf_')).toBe(false);
  });

  it('should return false for third-party identifiers starting with vf_', () => {
    expect(isValidSdkKey('vf_1PyHgVLpWuMxVFx')).toBe(false);
    expect(isValidSdkKey('vf_live_test_12345')).toBe(false);
    expect(isValidSdkKey('vf_something_else')).toBe(false);
  });

  it('should return false for non-vf strings', () => {
    expect(isValidSdkKey('random_string')).toBe(false);
    expect(isValidSdkKey('sdk_key_123')).toBe(false);
    expect(isValidSdkKey('VF_server_uppercase')).toBe(false);
  });
});
