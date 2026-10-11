import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// A test adapter, which plays the platform. Next.js loads it from
// NEXT_ADAPTER_PATH. A platform adapter, e.g. of Vercel, points
// flags/default-provider to a fast provider in the same way.
export default {
  name: 'test-platform-adapter',
  // A platform puts the manifest of the flags into its build output, e.g.
  // for Flags Explorer. Here, a directory of the test plays the build output.
  onBuildComplete({ distDir }) {
    const manifest = join(distDir, 'flags-manifest.json');
    if (!existsSync(manifest)) return;
    const output = join(distDir, 'platform-output');
    mkdirSync(output, { recursive: true });
    copyFileSync(manifest, join(output, 'flags-manifest.json'));
  },
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
