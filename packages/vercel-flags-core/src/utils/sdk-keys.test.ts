import { describe, expect, it } from 'vitest';
import { parseSdkKeyFromFlagsConnectionString } from './sdk-keys';

describe('parseSdkKeyFromFlagsConnectionString', () => {
  describe('direct SDK keys (vf_ prefix)', () => {
    it('should return the key unchanged if it starts with vf_', () => {
      expect(parseSdkKeyFromFlagsConnectionString('vf_test_key')).toBe(
        'vf_test_key',
      );
    });

    it('should work with various vf_ key formats', () => {
      expect(parseSdkKeyFromFlagsConnectionString('vf_abc123')).toBe(
        'vf_abc123',
      );
      expect(
        parseSdkKeyFromFlagsConnectionString('vf_server_production_key'),
      ).toBe('vf_server_production_key');
      expect(
        parseSdkKeyFromFlagsConnectionString(
          'vf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        ),
      ).toBe('vf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    });

    it('should return vf_ key even if it contains special characters', () => {
      expect(parseSdkKeyFromFlagsConnectionString('vf_key-with-dashes')).toBe(
        'vf_key-with-dashes',
      );
      expect(
        parseSdkKeyFromFlagsConnectionString('vf_key_with_underscores'),
      ).toBe('vf_key_with_underscores');
    });
  });

  describe('connection string parsing (flags: prefix)', () => {
    it('should extract sdkKey from connection string', () => {
      expect(parseSdkKeyFromFlagsConnectionString('flags:sdkKey=vf_test')).toBe(
        'vf_test',
      );
    });

    it('should extract sdkKey from complex connection string', () => {
      const connectionString =
        'flags:edgeConfigId=ecfg_abcd&edgeConfigToken=xxx&sdkKey=vf_my_key';
      expect(parseSdkKeyFromFlagsConnectionString(connectionString)).toBe(
        'vf_my_key',
      );
    });

    it('should work when sdkKey is in different positions', () => {
      expect(
        parseSdkKeyFromFlagsConnectionString(
          'flags:sdkKey=vf_first&other=value',
        ),
      ).toBe('vf_first');

      expect(
        parseSdkKeyFromFlagsConnectionString(
          'flags:other=value&sdkKey=vf_middle&another=param',
        ),
      ).toBe('vf_middle');

      expect(
        parseSdkKeyFromFlagsConnectionString(
          'flags:other=value&sdkKey=vf_last',
        ),
      ).toBe('vf_last');
    });

    it('should ignore other parameters', () => {
      const connectionString =
        'flags:edgeConfigId=ecfg_123&edgeConfigToken=token123&teamId=team_abc&sdkKey=vf_key';
      expect(parseSdkKeyFromFlagsConnectionString(connectionString)).toBe(
        'vf_key',
      );
    });

    it('should return null when sdkKey parameter is missing', () => {
      expect(
        parseSdkKeyFromFlagsConnectionString(
          'flags:edgeConfigId=ecfg_abcd&edgeConfigToken=xxx',
        ),
      ).toBeNull();
    });

    it('should return empty string if sdkKey is empty', () => {
      expect(parseSdkKeyFromFlagsConnectionString('flags:sdkKey=')).toBe('');
    });
  });

  describe('error cases', () => {
    it('should return null for empty string', () => {
      expect(parseSdkKeyFromFlagsConnectionString('')).toBeNull();
    });

    it('should return null for strings without vf_ or flags: prefix', () => {
      expect(parseSdkKeyFromFlagsConnectionString('random_string')).toBeNull();
      expect(parseSdkKeyFromFlagsConnectionString('sdk_key_123')).toBeNull();
      expect(parseSdkKeyFromFlagsConnectionString('VF_uppercase')).toBeNull();
    });

    it('should return null for just "flags:" without parameters', () => {
      expect(parseSdkKeyFromFlagsConnectionString('flags:')).toBeNull();
    });

    it('should return null for malformed strings', () => {
      expect(
        parseSdkKeyFromFlagsConnectionString('not_a_valid_input'),
      ).toBeNull();
      expect(
        parseSdkKeyFromFlagsConnectionString('flag:sdkKey=test'),
      ).toBeNull(); // typo in prefix
      expect(
        parseSdkKeyFromFlagsConnectionString('FLAGS:sdkKey=test'),
      ).toBeNull(); // wrong case
    });

    it('should handle URL-encoded values', () => {
      // URLSearchParams handles encoding
      expect(
        parseSdkKeyFromFlagsConnectionString('flags:sdkKey=vf_test%20key'),
      ).toBe('vf_test key');
    });
  });

  describe('edge cases', () => {
    it('should handle whitespace in value', () => {
      // Note: whitespace would be URL-encoded in a real connection string
      expect(parseSdkKeyFromFlagsConnectionString('flags:sdkKey=vf_key')).toBe(
        'vf_key',
      );
    });

    it('should return the first sdkKey if multiple are present', () => {
      // URLSearchParams.get() returns the first value
      expect(
        parseSdkKeyFromFlagsConnectionString(
          'flags:sdkKey=vf_first&sdkKey=vf_second',
        ),
      ).toBe('vf_first');
    });

    it('should handle special characters in other params', () => {
      expect(
        parseSdkKeyFromFlagsConnectionString(
          'flags:token=abc%3D%3D&sdkKey=vf_key',
        ),
      ).toBe('vf_key');
    });
  });
});
