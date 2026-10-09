import { describe, expect, it } from 'vitest';

describe('flags', () => {
  it('can be imported', async () => {
    await expect(import('.')).resolves.toBeDefined();
  });
});
