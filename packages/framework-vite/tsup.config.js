import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm', 'cjs'],
  splitting: true,
  sourcemap: true,
  clean: true,
  skipNodeModulesBundle: true,
  dts: true,
  external: [/^node:.*/],
});
