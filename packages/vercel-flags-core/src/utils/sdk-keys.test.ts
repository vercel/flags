import { describe, expect, it } from 'vitest';
import {
  isValidSdkKey,
  parseSdkKeyFromFlagsConnectionString,
} from './sdk-keys';

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

describe('parseSdkKeyFromFlagsConnectionString', () => {
  describe('direct SDK keys (vf_server_/vf_client_ prefix)', () => {
    it('should return the key unchanged for vf_server_ keys', () => {
      expect(parseSdkKeyFromFlagsConnectionString('vf_server_test_key')).toBe(
        'vf_server_test_key',
      );
    });

    it('should return the key unchanged for vf_client_ keys', () => {
      expect(parseSdkKeyFromFlagsConnectionString('vf_client_test_key')).toBe(
        'vf_client_test_key',
      );
    });

    it('should work with various valid key formats', () => {
      expect(parseSdkKeyFromFlagsConnectionString('vf_server_abc123')).toBe(
        'vf_server_abc123',
      );
      expect(
        parseSdkKeyFromFlagsConnectionString('vf_server_production_key'),
      ).toBe('vf_server_production_key');
      expect(
        parseSdkKeyFromFlagsConnectionString('vf_client_dev_environment'),
      ).toBe('vf_client_dev_environment');
    });

    it('should return null for invalid vf_ keys (not server/client)', () => {
      expect(parseSdkKeyFromFlagsConnectionString('vf_test_key')).toBeNull();
      expect(parseSdkKeyFromFlagsConnectionString('vf_abc123')).toBeNull();
      expect(
        parseSdkKeyFromFlagsConnectionString('vf_1PyHgVLpWuMxVFx'),
      ).toBeNull();
    });
  });

  describe('connection string parsing (flags: prefix)', () => {
    it('should extract sdkKey from connection string', () => {
      expect(
        parseSdkKeyFromFlagsConnectionString('flags:sdkKey=vf_server_test'),
      ).toBe('vf_server_test');
    });

    it('should extract sdkKey from complex connection string', () => {
      const connectionString =
        'flags:edgeConfigId=ecfg_abcd&edgeConfigToken=xxx&sdkKey=vf_client_my_key';
      expect(parseSdkKeyFromFlagsConnectionString(connectionString)).toBe(
        'vf_client_my_key',
      );
    });

    it('should work when sdkKey is in different positions', () => {
      expect(
        parseSdkKeyFromFlagsConnectionString(
          'flags:sdkKey=vf_server_first&other=value',
        ),
      ).toBe('vf_server_first');

      expect(
        parseSdkKeyFromFlagsConnectionString(
          'flags:other=value&sdkKey=vf_client_middle&another=param',
        ),
      ).toBe('vf_client_middle');

      expect(
        parseSdkKeyFromFlagsConnectionString(
          'flags:other=value&sdkKey=vf_server_last',
        ),
      ).toBe('vf_server_last');
    });

    it('should ignore other parameters', () => {
      const connectionString =
        'flags:edgeConfigId=ecfg_123&edgeConfigToken=token123&teamId=team_abc&sdkKey=vf_server_key';
      expect(parseSdkKeyFromFlagsConnectionString(connectionString)).toBe(
        'vf_server_key',
      );
    });

    it('should return null when sdkKey parameter is missing', () => {
      expect(
        parseSdkKeyFromFlagsConnectionString(
          'flags:edgeConfigId=ecfg_abcd&edgeConfigToken=xxx',
        ),
      ).toBeNull();
    });

    it('should return null if sdkKey is empty', () => {
      expect(parseSdkKeyFromFlagsConnectionString('flags:sdkKey=')).toBeNull();
    });

    it('should return null for invalid sdkKey in connection string', () => {
      expect(
        parseSdkKeyFromFlagsConnectionString('flags:sdkKey=vf_invalid_key'),
      ).toBeNull();
      expect(
        parseSdkKeyFromFlagsConnectionString('flags:sdkKey=vf_1PyHgVLpWuMxVFx'),
      ).toBeNull();
    });
  });

  describe('error cases', () => {
    it('should return null for empty string', () => {
      expect(parseSdkKeyFromFlagsConnectionString('')).toBeNull();
    });

    it('should return null for strings without valid prefix', () => {
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
        parseSdkKeyFromFlagsConnectionString('flag:sdkKey=vf_server_test'),
      ).toBeNull();
      expect(
        parseSdkKeyFromFlagsConnectionString('FLAGS:sdkKey=vf_server_test'),
      ).toBeNull();
    });
  });

  describe('third-party identifier rejection', () => {
    it('should reject Stripe identity flow IDs', () => {
      expect(
        parseSdkKeyFromFlagsConnectionString(
          'vf_1PyHgVLpWuMxVFxAbCdEfGhIjKlMn',
        ),
      ).toBeNull();
    });

    it('should reject other third-party vf_ prefixed identifiers', () => {
      expect(
        parseSdkKeyFromFlagsConnectionString('vf_live_test_12345'),
      ).toBeNull();
      expect(
        parseSdkKeyFromFlagsConnectionString('vf_something_else'),
      ).toBeNull();
    });

    it('should reject third-party identifiers in connection strings', () => {
      expect(
        parseSdkKeyFromFlagsConnectionString(
          'flags:sdkKey=vf_1PyHgVLpWuMxVFxAbCdEfGhIjKlMn',
        ),
      ).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should return the first valid sdkKey if multiple are present', () => {
      expect(
        parseSdkKeyFromFlagsConnectionString(
          'flags:sdkKey=vf_server_first&sdkKey=vf_client_second',
        ),
      ).toBe('vf_server_first');
    });

    it('should handle special characters in other params', () => {
      expect(
        parseSdkKeyFromFlagsConnectionString(
          'flags:token=abc%3D%3D&sdkKey=vf_server_key',
        ),
      ).toBe('vf_server_key');
    });
  });
});
