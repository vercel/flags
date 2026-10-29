import path from 'node:path';
import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_SERVER } from 'next/constants';
import { generateFlags } from './flags/generate.ts';

export default async function nextConfig(phase: string): Promise<NextConfig> {
  // Production serves compiled modules. It must not regenerate their catalog.
  if (phase === PHASE_PRODUCTION_SERVER) {
    return {};
  }
  const aliases = await generateFlags();
  return {
    turbopack: { resolveAlias: aliases },
    webpack(config, { webpack }) {
      // Webpack treats URI schemes before normal aliases. Rewrite the request.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^flags:/,
          (resource: { request: string }) => {
            const target = aliases[resource.request];
            if (!target) {
              throw new Error(`Unknown flags connection: ${resource.request}`);
            }
            resource.request = path.resolve(import.meta.dirname, target);
          },
        ),
      );
      return config;
    },
  };
}
