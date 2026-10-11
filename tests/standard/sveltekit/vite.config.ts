import { sveltekit } from '@sveltejs/kit/vite';
import { flags } from 'flags/vite';
import { defineConfig } from 'vite';

const platform = process.env.TEST_VARIANT === 'platform';

export default defineConfig({
  plugins: [
    sveltekit(),
    // The framework binding gives the SDK the request and flags.config.ts.
    // The platform variant plays a build on a platform: the plugin uses the
    // default provider of the platform. On Vercel, it does this itself with
    // @vercel/flags-core.
    flags({
      framework: 'sveltekit',
      defaultProvider: platform ? './src/deployment-provider.ts' : undefined,
    }),
  ],
});
