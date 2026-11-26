import type { NextConfig } from 'next';
import { describe, expect, it } from 'vitest';
import { withFlags } from './plugin';

describe('withFlags', () => {
  it('points flags/framework to the binding of Next.js', () => {
    const config = withFlags<NextConfig>({});

    expect(config.turbopack?.resolveAlias).toEqual({
      'flags/framework': '@flags-sdk/next/binding',
    });
  });

  it('keeps the configuration and its aliases', () => {
    const config = withFlags<NextConfig>({
      reactStrictMode: true,
      turbopack: { resolveAlias: { 'my-module': './my-module.ts' } },
    });

    expect(config.reactStrictMode).toBe(true);
    expect(config.turbopack?.resolveAlias).toEqual({
      'my-module': './my-module.ts',
      'flags/framework': '@flags-sdk/next/binding',
    });
  });

  it('takes a configuration function of the phase', async () => {
    const config = withFlags<NextConfig>(async (phase) => ({
      distDir: phase === 'phase-production-build' ? 'out' : '.next',
    }));

    const resolved = await config('phase-production-build', {
      defaultConfig: {},
    });
    expect(resolved.distDir).toBe('out');
    expect(resolved.turbopack?.resolveAlias).toEqual({
      'flags/framework': '@flags-sdk/next/binding',
    });
  });

  it('throws for a build with webpack', () => {
    const config = withFlags<NextConfig>({});

    expect(() => (config.webpack as () => unknown)()).toThrow(
      'flags: withFlags supports only Turbopack.',
    );
  });
});
