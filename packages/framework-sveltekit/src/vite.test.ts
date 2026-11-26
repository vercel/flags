import { describe, expect, it } from 'vitest';
import { flags } from './vite';

describe('flags()', () => {
  it('points flags/framework to the binding of SvelteKit, and bundles the SDK', () => {
    const plugin = flags();
    const config = (plugin.config as () => Record<string, unknown>)();

    expect(config).toEqual({
      resolve: {
        alias: [
          {
            find: /^flags\/framework$/,
            // The absolute path of the binding next to the plugin
            replacement: expect.stringMatching(/[\\/]binding\.js$/),
          },
        ],
      },
      // The alias only applies to bundled code
      ssr: { noExternal: ['flags', '@flags-sdk/sveltekit'] },
      optimizeDeps: { exclude: ['flags', '@flags-sdk/sveltekit'] },
    });
  });
});
