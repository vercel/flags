import { describe, it, expect } from 'vitest';
import { getAppHost } from '.';

describe('getAppHost', () => {
  it('maps us.i.posthog.com', () => {
    expect(getAppHost('https://us.i.posthog.com')).toBe(
      'https://us.posthog.com',
    );
  });
  it('maps eu.i.posthog.com', () => {
    expect(getAppHost('https://eu.i.posthog.com')).toBe(
      'https://eu.posthog.com',
    );
  });
});
