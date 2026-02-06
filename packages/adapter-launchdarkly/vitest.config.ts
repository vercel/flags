import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [],
  test: {
    environment: 'node',
    server: {
      deps: {
        // Inline LaunchDarkly SDK packages to work around ESM directory import issues
        inline: [
          '@launchdarkly/vercel-server-sdk',
          '@launchdarkly/js-server-sdk-common-edge',
        ],
      },
    },
  },
});
