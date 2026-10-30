import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_SERVER } from 'next/constants.js';

export function withFlags(
  config: NextConfig = {},
  options: { directory?: string } = {},
) {
  const directory = path.resolve(options.directory ?? process.cwd());

  return async (phase: string): Promise<NextConfig> => {
    if (phase === PHASE_PRODUCTION_SERVER) {
      return config;
    }

    // Only resolution data enters the config loader. Source modules stay outside.
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
