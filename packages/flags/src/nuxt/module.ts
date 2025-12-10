import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveModulePath } from 'exsolve';
import {
  addBuildPlugin,
  addImports,
  addImportsDir,
  addPluginTemplate,
  addServerHandler,
  addServerImports,
  addServerImportsDir,
  addServerTemplate,
  addTemplate,
  addTypeTemplate,
  createIsIgnored,
  createResolver,
  defineNuxtModule,
  extendViteConfig,
  extendWebpackConfig,
  resolveAlias,
} from 'nuxt/kit';
import { provider } from 'std-env';
import { FlagsPlugin } from './plugins';
import {
  clientImplementation,
  FLAG_LIST_ID,
  injectFlagsTemplate,
  pluginPrecomputeServerTemplate,
  serverImplementation,
} from './templates';

interface ModuleOptions {
  /** The directory to scan for exported feature flags */
  dir: string | false;
  /** Whether to eagerly evaluate all flags on the server (which are defined in `flags.dir`) */
  injectAllFlags: boolean;
  /** Whether to enable support for the Vercel Toolbar */
  toolbar: {
    enabled: boolean;
  };
}

export default defineNuxtModule<ModuleOptions>().with({
  meta: {
    name: 'flags',
    configKey: 'flags',
  },
  defaults: (nuxt) => ({
    dir: '~~/flags',
    injectAllFlags: true,
    toolbar: {
      enabled:
        provider === 'vercel' ||
        nuxt.options.nitro.preset?.includes('vercel') ||
        !!resolveModulePath('@vercel/toolbar', {
          from: nuxt.options.modulesDir,
          try: true,
        }),
    },
  }),
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);

    nuxt.options.vite.optimizeDeps ||= {};
    nuxt.options.vite.optimizeDeps.include ||= [];
    nuxt.options.vite.optimizeDeps.include.push('flags/nuxt/runtime');

    nuxt.options.vite.optimizeDeps.exclude ||= [];
    nuxt.options.vite.optimizeDeps.exclude.push('#flags-implementation');

    addServerTemplate({
      filename: '#flags-implementation',
      getContents: () => serverImplementation,
    });

    addTemplate({
      filename: 'flags/implementation.mjs',
      getContents: () => clientImplementation,
    });

    nuxt.options.alias['#flags-implementation'] =
      '#build/flags/implementation.mjs';

    const exports = ['defineFlag'];
    for (const name of exports) {
      addImports({ name, from: 'flags/nuxt/runtime' });
      addServerImports({ name, from: 'flags/nuxt/runtime' });
    }

    const resolvedDir =
      options.dir &&
      resolve(
        nuxt.options.rootDir,
        resolveAlias(options.dir, nuxt.options.alias),
      );

    if (resolvedDir) {
      nuxt.options.alias['#flags'] = resolvedDir;

      nuxt.hook('prepare:types', (opts) => {
        opts.sharedTsConfig.include ||= [];
        opts.sharedTsConfig.include.push(`${resolvedDir}/**/*.ts`);
      });

      addImportsDir(resolvedDir);
      addServerImportsDir(resolvedDir);
    }

    const buildPlugin = FlagsPlugin({
      dir: resolvedDir,
      injectAllFlags: options.injectAllFlags,
    });

    addBuildPlugin(buildPlugin.client, { server: false });
    addBuildPlugin(buildPlugin.server, { client: false });

    nuxt.hook('nitro:config', (nitroConfig) => {
      nitroConfig.rollupConfig ||= {};
      nitroConfig.rollupConfig.plugins ||= [];
      (nitroConfig.rollupConfig.plugins as any[]).push(
        buildPlugin.server.rollup(),
      );
    });

    // server-only utils
    addServerImports({
      name: 'handlePrecomputedPaths',
      from: 'flags/nuxt/runtime',
    });

    addTypeTemplate(
      {
        filename: 'flags-declaration.d.ts',
        getContents() {
          return `      
declare global {
  const defineFlag: typeof import('flags/nuxt/runtime')['defineFlag']
}
export {}
`;
        },
      },
      { shared: true },
    );

    // TODO: check if user has provided their own flag
    if (options.toolbar?.enabled) {
      addServerHandler({
        route: '/.well-known/vercel/flags',
        handler: resolver.resolve('./nuxt/runtime/server/flags.js'),
      });
    }

    if (options.injectAllFlags && resolvedDir) {
      extendViteConfig((viteConfig) => {
        viteConfig.ssr ||= {};
        viteConfig.ssr.external ||= [];
        viteConfig.build ||= {};
        viteConfig.build.rollupOptions ||= {};
        viteConfig.build.rollupOptions.external ||= [];
        viteConfig.resolve ||= {};
        viteConfig.resolve.external ||= [];
        for (const configPart of [
          viteConfig.ssr.external,
          viteConfig.resolve.external,
          viteConfig.build.rollupOptions.external,
        ]) {
          if (Array.isArray(configPart)) {
            configPart.push(FLAG_LIST_ID);
          }
        }
      });
      extendWebpackConfig((webpackConfig) => {
        webpackConfig.externals ||= [];
        if (Array.isArray(webpackConfig.externals)) {
          webpackConfig.externals.push(FLAG_LIST_ID);
        }
      });
      addPluginTemplate({
        mode: 'server',
        filename: 'flags/inject-all-flags.mjs',
        getContents: () => injectFlagsTemplate,
      });
    }

    if (options.toolbar?.enabled || options.injectAllFlags) {
      const noDefinedFlags = 'export const flags = {}';
      const isIgnored = createIsIgnored(nuxt);
      addServerTemplate({
        filename: FLAG_LIST_ID,
        getContents() {
          if (!resolvedDir) {
            return noDefinedFlags;
          }
          try {
            const isDir = statSync(resolvedDir).isDirectory();
            if (!isDir) {
              return noDefinedFlags;
            }
            const files = readdirSync(resolvedDir).filter(
              (f) =>
                /\.[cm]?[tj]s$/.test(f) &&
                !isIgnored(join(resolvedDir, f), nuxt.options.ignore),
            );
            const lines = files.map(
              (f, index) =>
                `import * as n${index} from ${JSON.stringify(join(resolvedDir, f))}`,
            );
            return (
              lines.join('\n') +
              `\nexport const flags = {${files.map((f, index) => `...n${index}`).join(', ')}}`
            );
          } catch {}
          return noDefinedFlags;
        },
      });
    }

    addTemplate({
      filename: 'flags/config.mjs',
      getContents: () =>
        `export const toolbarEnabled = ${!!options.toolbar.enabled}`,
    });

    addPluginTemplate(resolver.resolve('./nuxt/runtime/app/plugin.server.js'));

    let hasPrecompute = false;

    nuxt.hook('nitro:config', (nitroConfig) => {
      nitroConfig.bundledStorage ||= [];
      nitroConfig.bundledStorage.push('flags-precompute');

      nitroConfig.devStorage ||= {};
      nitroConfig.devStorage['flags-precompute'] = {
        driver: 'fs',
        base: join(nuxt.options.buildDir, 'flags-precompute'),
      };

      nitroConfig.virtual ||= {};
      nitroConfig.virtual['#flags-prerender-middleware'] =
        `export { prerenderMiddleware as default } from 'flags/nuxt/runtime'`;

      nitroConfig.handlers ||= [];
      nitroConfig.handlers.unshift({
        handler: '#flags-prerender-middleware',
        route: '',
        middleware: true,
      });
    });

    nuxt.hook('nitro:init', (nitro) => {
      hasPrecompute =
        nitro.options.static ||
        nitro.options.prerender.routes.length > 0 ||
        nitro.options.prerender.crawlLinks ||
        Object.values(nitro.options.routeRules).some((rule) => rule.prerender);

      if (!hasPrecompute) {
        nitro.options.bundledStorage = nitro.options.bundledStorage?.filter(
          (s) => s !== 'flags-precompute',
        );
        return;
      }

      nitro.options.storage ||= {};
      nitro.options.storage['flags-static-cache'] = {
        driver: 'lru-cache',
        max: 200,
      };

      nitro.hooks.hook('prerender:generate', (route) => {
        if (route.contentType?.includes('x-skip-prerender=1')) {
          delete route.error;

          nitro._prerenderedRoutes ||= [];
          nitro._prerenderedRoutes.push({ ...route });

          // better display in the console
          route.route = `/[precomputed-hash?]${route.route}`;
        }
      });

      // strip out hashed routes from nuxt manifest
      nitro.hooks.hook('prerender:done', async (ctx) => {
        const prerenderedRoutes =
          await nitro.storage.getKeys('flags-precompute');
        const hashes = await Promise.all(
          prerenderedRoutes.map((k) => nitro.storage.getItem<string[]>(k)),
        );
        const prefix = new Set(hashes.flat());
        nitro._prerenderedRoutes = nitro._prerenderedRoutes?.filter((r) => {
          const hash = r.route.split('/')[1];
          return !hash || !prefix.has(hash);
        });
      });
    });

    addPluginTemplate({
      filename: 'flags/plugin-precompute.server.mjs',
      getContents: () => pluginPrecomputeServerTemplate(hasPrecompute),
    });
  },
});
