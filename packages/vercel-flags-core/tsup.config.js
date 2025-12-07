import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/openfeature.ts'],
  format: ['esm', 'cjs'],
  splitting: true,
  sourcemap: true,
  minify: false,
  clean: true,
  skipNodeModulesBundle: true,
  dts: true,
  external: ['node_modules'],
  // copies over the definitions.json file to dist/
  publicDir: 'public',
});
