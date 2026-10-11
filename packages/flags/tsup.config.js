import { defineConfig } from 'tsup';

/**
 * Keeps the imports of the modules which a framework can replace with a
 * bundler alias. tsconfig.json maps them to the source for the type check,
 * and esbuild would follow that mapping and bundle them. A bundler alias of
 * the application can only replace an import which is still there.
 */
const replaceable = /^flags\/(default-provider|framework|config)$/;

const keepReplaceableImports = {
  name: 'keep-replaceable-imports',
  setup(build) {
    build.onResolve({ filter: replaceable }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
};

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    // Separate entries, so that a bundler can replace them with an alias
    'default-provider': 'src/default-provider.ts',
    framework: 'src/framework.ts',
    'config-module': 'src/config-module.ts',
    manifest: 'src/manifest.ts',
    tooling: 'src/tooling.ts',
    cli: 'src/cli.ts',
  },
  format: ['esm', 'cjs'],
  splitting: true,
  sourcemap: true,
  minify: false,
  clean: true,
  skipNodeModulesBundle: true,
  dts: true,
  external: [/^node:.*/, 'node_modules'],
  esbuildPlugins: [keepReplaceableImports],
  removeNodeProtocol: false,
});
