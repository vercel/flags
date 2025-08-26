import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { provider } from 'std-env';
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
  resolveAlias,
} from 'nuxt/kit';

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
    dir: '#shared/flags',
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
        return `
import { getRouterParams } from 'h3'
export function getStore(event) {
  return event.context.flags ||= {
    event,
    secret: process.env.FLAGS_SECRET,
    params: getRouterParams(event),
    usedFlags: {},
    identifiers: new Map(),
  };
}
export function getState(key) {
  return { value: undefined }
}
        `;
      },
    });

    addTemplate({
      filename: 'flags/implementation.mjs',
      getContents: () => `
import { useNuxtApp, useState } from "#imports"

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

    addImports({
      name: 'defineFlag',
      from: 'flags/nuxt/runtime',
    });

    addServerImports({
      name: 'defineFlag',
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
      const path = resolveAlias(options.dir, nuxt.options.alias);

      addImportsDir(path);
      addServerImportsDir(path);
    }

    if (options.toolbar?.enabled) {
      addServerHandler({
        route: '/.well-known/vercel/flags',
        handler: resolver.resolve('./nuxt/runtime/server/flags.js'),
      });

      addServerTemplate({
        filename: '#flags/defined-flags',
        getContents() {
          if (!options.dir) {
            return 'export const flags = {}';
          }
          const path = resolveAlias(options.dir, nuxt.options.alias);
          try {
            const isDir = statSync(path).isDirectory();
            if (isDir) {
              const files = readdirSync(path);
              const lines = files.map(
                (f, index) =>
                  `import * as n${index} from ${JSON.stringify(join(path, f))}`,
              );
              return (
                lines.join('\n') +
                `\nexport const flags = {${files.map((f, index) => `...n${index}`).join(', ')}}`
              );
            }
          } catch {}
          return 'export const flags = {}';
        },
      });
    }

    addTemplate({
      filename: 'flags/config.mjs',
      getContents: () =>
        `export const toolbarEnabled = ${!!options.toolbar.enabled}`,
    });

    addPluginTemplate(resolver.resolve('./nuxt/runtime/app/plugin.server.js'));
  },
});
