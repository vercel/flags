import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  sourcemap: true,
  clean: true,
  skipNodeModulesBundle: true,
  dts: true,
  external: [/^node:.*/],
});
