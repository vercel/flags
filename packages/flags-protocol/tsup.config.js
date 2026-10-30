import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    next: 'src/next.ts',
    'next-config': 'src/next-config.ts',
    generate: 'src/generate.ts',
    cli: 'src/cli.ts',
  },
  format: ['esm'],
  target: 'node22',
  splitting: true,
  sourcemap: true,
  clean: true,
  skipNodeModulesBundle: true,
  dts: true,
  external: ['server-only'],
});
