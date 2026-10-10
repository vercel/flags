import { describe, expect, it } from 'vitest';
import { createDefaultProvider } from './default-provider.default';
import { createDefaultProvider as createForNextJs } from './default-provider.next-js';
import { VercelProvider } from './openfeature.default';
import { VercelProvider as VercelProviderForNextJs } from './openfeature.next-js';

describe('createDefaultProvider', () => {
  it('returns the VercelProvider with the default client', () => {
    const provider = createDefaultProvider();

    expect(provider).toBeInstanceOf(VercelProvider);
    expect(provider.metadata.name).toBe('vercel-nodejs-provider');
  });

  it('returns the VercelProvider of Next.js in the Next.js variant', () => {
    expect(createForNextJs()).toBeInstanceOf(VercelProviderForNextJs);
  });
});
