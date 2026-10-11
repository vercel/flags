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
    next: 'src/next/index.ts',
    'next-plugin': 'src/next/plugin.ts',
    'next-precompute': 'src/next/precompute.ts',
    'next-use-flags-loader': 'src/next/use-flags-loader.ts',
    'next-manifest': 'src/next/manifest.ts',
    'next-manifest-loader': 'src/next/manifest-loader.ts',
    manifest: 'src/manifest.ts',
    vite: 'src/vite.ts',
    cli: 'src/cli.ts',
    nuxt: 'src/nuxt.ts',
    sveltekit: 'src/sveltekit.ts',
    'tanstack-start': 'src/tanstack-start.ts',
    'nuxt-runtime': 'src/nuxt-runtime.ts',
    'nuxt-plugin': 'src/nuxt-plugin.ts',
    hono: 'src/hono.ts',
    express: 'src/express.ts',
  },
  format: ['esm', 'cjs'],
  splitting: true,
  sourcemap: true,
  minify: false,
  clean: true,
  skipNodeModulesBundle: true,
  dts: true,
  // $app/* (SvelteKit), #imports (Nitro) and flags:* (resolved by flags/vite)
  // are modules of the framework in the build of the application
  external: [/^node:.*/, /^\$app\//, /^#imports$/, /^flags:/, 'node_modules'],
  esbuildPlugins: [keepReplaceableImports],
  removeNodeProtocol: false,
});
