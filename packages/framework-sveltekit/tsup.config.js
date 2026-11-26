import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    binding: 'src/binding.ts',
    vite: 'src/vite.ts',
  },
  format: ['esm', 'cjs'],
  splitting: true,
  sourcemap: true,
  clean: true,
  skipNodeModulesBundle: true,
  dts: true,
  // import.meta.url of src/vite.ts in the CommonJS build
  shims: true,
  // The modules of SvelteKit exist only in the bundle of the application
  external: [/^node:.*/, /^\$app\//, /^\$env\//],
});
