import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { NextConfig } from 'next';
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from 'next/constants.js';
import { generateFlags, watchFlags } from './generate.ts';

// Next can evaluate config more than once. Share startup, even across module reloads.
const registryKey = Symbol.for('@flags-sdk/protocol/next-catalogs');
const registry = globalThis as typeof globalThis & {
  [registryKey]?: Map<string, Promise<void>>;
};
registry[registryKey] ??= new Map();
const catalogs = registry[registryKey];
const { updateInitialEnv } = createRequire(import.meta.url)(
  '@next/env',
) as typeof import('@next/env');

function prepareCatalogs(directory: string, watch: boolean): Promise<void> {
  const key = `${watch ? 'watch' : 'build'}:${directory}`;
  const ownerKey = `__FLAGS_PROTOCOL_NEXT_${createHash('sha256').update(key).digest('hex')}`;
  const setOwner = (owner?: number) => {
    const value = owner === undefined ? undefined : String(owner);
    if (value === undefined) {
      delete process.env[ownerKey];
    } else {
      process.env[ownerKey] = value;
    }
    // Next resets environment variables before starting compiler workers.
    updateInitialEnv({ [ownerKey]: value });
  };
  const existing = catalogs.get(key);
  if (existing) {
    return existing;
  }

  // Next's isolated config contexts and compiler workers see this only after
  // initial generation. Reuse that session, including in the same process.
  const owner = Number(process.env[ownerKey]);
  if (Number.isInteger(owner) && owner > 0) {
    try {
      process.kill(owner, 0);
      return Promise.resolve();
    } catch {
      // A restarted server must replace a subscription owned by an exited process.
      setOwner();
    }
  }

  const controller = new AbortController();
  const stop = () => controller.abort();
  const cleanup = () => {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    process.removeListener('exit', stop);
  };
  const ready = (async () => {
    if (!watch) {
      await generateFlags(directory);
      setOwner(process.pid);
      return;
    }
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    process.once('exit', stop);
    try {
      const { done } = await watchFlags(directory, {
        signal: controller.signal,
      });
      setOwner(process.pid);
      console.log('[flags] Watching catalogs through withFlags().');
      void done
        .catch((error: unknown) => {
          catalogs.delete(key);
          setOwner();
          console.error(
            '[flags] Catalog watch stopped. Restart next dev.',
            error,
          );
        })
        .finally(() => {
          cleanup();
          if (controller.signal.aborted) {
            catalogs.delete(key);
            setOwner();
          }
        });
    } catch (error) {
      cleanup();
      throw error;
    }
  })();
  catalogs.set(key, ready);
  void ready.catch(() => catalogs.delete(key));
  return ready;
}

export function withFlags(
  config: NextConfig = {},
  options: { directory?: string } = {},
) {
  const directory = path.resolve(options.directory ?? process.cwd());

  return async (phase: string): Promise<NextConfig> => {
    if (phase === PHASE_PRODUCTION_SERVER) {
      return config;
    }

    if (phase === PHASE_DEVELOPMENT_SERVER) {
      await prepareCatalogs(directory, true);
    } else if (phase === PHASE_PRODUCTION_BUILD) {
      await prepareCatalogs(directory, false);
    }

    // Catalog tooling loads catalog.ts only. Providers and request context stay out.
    const manifest = await readFile(
      path.join(directory, '.flags/manifest.json'),
      'utf8',
    ).catch((cause: unknown) => {
      throw new Error('Run pnpm flags:sync before starting Next.js.', {
        cause,
      });
    });
    const aliases = JSON.parse(manifest) as Record<string, string>;

    return {
      ...config,
      turbopack: {
        ...config.turbopack,
        resolveAlias: { ...config.turbopack?.resolveAlias, ...aliases },
      },
      webpack(webpackConfig, context) {
        const configured =
          config.webpack?.(webpackConfig, context) ?? webpackConfig;
        configured.plugins ??= [];
        // Webpack handles URI schemes before aliases, so rewrite the request.
        configured.plugins.push(
          new context.webpack.NormalModuleReplacementPlugin(
            /^flags:/,
            (resource: { request: string }) => {
              const target = aliases[resource.request];
              if (!target) {
                throw new Error(`Unknown flags source: ${resource.request}`);
              }
              resource.request = path.resolve(directory, target);
            },
          ),
        );
        return configured;
      },
    };
  };
}
