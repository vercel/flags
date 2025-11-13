import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveModulePath } from 'exsolve';
import {
  addImports,
  addImportsDir,
  addPluginTemplate,
  addServerHandler,
  addServerImports,
  addServerImportsDir,
  addServerTemplate,
  addTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  isIgnored,
  resolveAlias,
} from 'nuxt/kit';
import { provider } from 'std-env';

interface ModuleOptions {
  /** The directory to scan for exported feature flags */
  dir: string | false;
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
      getContents() {
        return /* js */ `
import { getRouterParams } from 'h3'
import { useEvent } from 'nitropack/runtime'

export function getStore(event) {
  return event.context.flags ||= {
    event,
    secret: process.env.FLAGS_SECRET,
    params: getRouterParams(event),
    usedFlags: {},
    identifiers: new Map(),
  };
}
export function getEvent() {
  try {
    return useEvent()
  } catch {
    throw new Error('If you do not have nitro.experimental.asyncContext enabled, you must pass the event explicitly to flag functions.')
  }
}
export function getState(key) {
  return { value: undefined }
}
        `;
      },
    });

    addTemplate({
      filename: 'flags/implementation.mjs',
      getContents: () => /* js */ `
import { useNuxtApp, useRequestEvent, useState } from "#imports"

export function getEvent() {
  return useRequestEvent()
}

export function getStore() {
  return useNuxtApp().$flagStore
}

export function getState(key) {
  return useState(\`flag:$\{key}\`);
}
      `,
    });

    nuxt.options.alias['#flags-implementation'] =
      '#build/flags/implementation.mjs';

    const exports = ['defineFlag'];
    for (const name of exports) {
      addImports({ name, from: 'flags/nuxt/runtime' });
      addServerImports({ name, from: 'flags/nuxt/runtime' });
    }

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

    if (options.dir) {
      const path = resolve(
        nuxt.options.rootDir,
        resolveAlias(options.dir, nuxt.options.alias),
      );

      nuxt.options.alias['#flags'] = path;

      nuxt.hook('prepare:types', (opts) => {
        opts.sharedTsConfig.include ||= [];
        opts.sharedTsConfig.include.push(`${path}/**/*.ts`);
      });

      addImportsDir(path);
      addServerImportsDir(path);
    }

    if (options.toolbar?.enabled) {
      addServerHandler({
        route: '/.well-known/vercel/flags',
        handler: resolver.resolve('./nuxt/runtime/server/flags.js'),
      });

      const noDefinedFlags = 'export const flags = {}';
      addServerTemplate({
        filename: '#flags/defined-flags',
        getContents() {
          if (!options.dir) {
            return noDefinedFlags;
          }
          const path = resolveAlias(options.dir, nuxt.options.alias);
          try {
            const isDir = statSync(path).isDirectory();
            if (!isDir) {
              return noDefinedFlags;
            }
            const files = readdirSync(path).filter(
              (f) =>
                /\.(ts|js|mjs|cjs)$/.test(f) &&
                !isIgnored(f, nuxt.options.ignore),
            );
            const lines = files.map(
              (f, index) =>
                `import * as n${index} from ${JSON.stringify(join(path, f))}`,
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
          // better display in the console
          route.route = `/[precomputed-hash?]${route.route}`;
          delete route.error;
        }
      });
    });

    addPluginTemplate({
      filename: 'flags/plugin-precompute.server.mjs',
      getContents: () => /* js */ `
import { defineNuxtPlugin } from '#app';
/**
 * Nuxt plugin that strips hash prefixes from URLs during prerendering.
 * This runs before the router initializes, allowing Vue Router to see the correct path.
 */
export default defineNuxtPlugin({
  name: 'flags:precompute-rewrite',
  order: -50,
  setup(nuxtApp) {
    ${hasPrecompute ? '' : 'return;'}
    if (import.meta.server && import.meta.prerender && nuxtApp.ssrContext) {
      const hash = nuxtApp.ssrContext.event.context?.precomputedFlags?.hash;
      if (hash) {
        nuxtApp.ssrContext.url = nuxtApp.payload.path = nuxtApp.ssrContext.url.replace(\`/\${hash}\`, '');
      }
    }
  },
});
      `,
    });
  },
});
