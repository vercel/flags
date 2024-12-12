import { defineConfig } from 'tsup';

const defaultConfig = {
  format: ['esm', 'cjs'],
  splitting: true,
  sourcemap: true,
  minify: false,
  clean: false,
  skipNodeModulesBundle: true,
  dts: true,
  external: ['node_modules'],
};

// eslint-disable-next-line import/no-default-export -- [@vercel/style-guide@5 migration]
export default defineConfig({
  entry: [
    'src/next/index.ts',
    'src/sveltekit/index.ts',
    'src/react/index.tsx',
    'src/index.ts',
    'src/analytics.ts',
    'src/providers/launchdarkly.ts',
    'src/providers/split.ts',
    'src/providers/statsig.ts',
    'src/providers/optimizely.ts',
    'src/providers/happykit.ts',
    'src/providers/hypertune.ts',
  ],
  ...defaultConfig,
});
