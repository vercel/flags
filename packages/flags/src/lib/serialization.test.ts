import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from './serialization';

const invalidSecret = 'short';

describe('serialization secret validation', () => {
  it('rejects signing with a secret that is not 32 bytes', async () => {
    await expect(
      serialize({ feature: true }, [{ key: 'feature' }], invalidSecret),
    ).rejects.toThrow('flags: Invalid secret');
  });

  it('rejects verification with a secret that is not 32 bytes', async () => {
    await expect(
      deserialize('invalid.code', [{ key: 'feature' }], invalidSecret),
    ).rejects.toThrow('flags: Invalid secret');
  });
});
