import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/next.ts', 'src/noop.ts'],
  format: ['esm', 'cjs'],
  splitting: false,
  sourcemap: true,
  minify: false,
  clean: true,
  dts: true,
  external: ['next', 'next/server'],
});
