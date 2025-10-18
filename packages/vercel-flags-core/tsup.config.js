import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/openfeature.ts'],
  format: 'esm',
  splitting: true,
  sourcemap: true,
  minify: false,
  clean: true,
  skipNodeModulesBundle: true,
  dts: true,
  external: ['node_modules'],
});
