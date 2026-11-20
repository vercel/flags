import { describe, expect, it } from 'vitest';

describe('flags', () => {
  it('can be imported', async () => {
    await expect(import('.')).resolves.toBeDefined();
  });

  it('keeps the main export small', async () => {
    expect(Object.keys(await import('.')).sort()).toEqual([
      'DECIDE_REASON',
      'FlagEvaluationError',
      'OVERRIDE_REASON',
      'defineFlag',
      'defineSource',
      'evaluate',
      'track',
    ]);
  });

  it('has the runtime in flags/runtime', async () => {
    expect(Object.keys(await import('./runtime-module')).sort()).toEqual([
      'registerFlags',
      'registerSources',
      'runtime',
    ]);
  });

  it('has the protocol of Flags Explorer in flags/explorer', async () => {
    expect(Object.keys(await import('./explorer')).sort()).toEqual([
      'OverridesError',
      'decryptFlagValues',
      'decryptOverrides',
      'encryptFlagValues',
      'encryptOverrides',
      'serializeFlagValues',
      'signOverrides',
    ]);
  });
});
