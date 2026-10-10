// A test adapter, which plays the platform. Next.js loads it from
// NEXT_ADAPTER_PATH. A platform adapter, e.g. of Vercel, points
// flags/default-provider to a fast provider in the same way.
export default {
  name: 'test-platform-adapter',
  modifyConfig(config, { phase }) {
    if (phase !== 'phase-production-build') return config;
    return {
      ...config,
      turbopack: {
        ...config.turbopack,
        resolveAlias: {
          ...config.turbopack?.resolveAlias,
          'flags/default-provider': './platform-provider.mjs',
        },
      },
    };
  },
};
