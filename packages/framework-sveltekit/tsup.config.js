import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    binding: 'src/binding.ts',
    vite: 'src/vite.ts',
  },
  format: ['esm', 'cjs'],
  splitting: true,
  sourcemap: true,
  clean: true,
  skipNodeModulesBundle: true,
  dts: true,
  external: [/^node:.*/, /^\$app\//],
});
