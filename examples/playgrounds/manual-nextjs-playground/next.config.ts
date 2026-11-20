import { withFlags } from '@flags-sdk/next/plugin';
import withVercelToolbar from '@vercel/toolbar/plugins/next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

// withFlags is the outer plugin: it returns a function of the phase, and it
// takes the configuration of the other plugins
export default withFlags(withVercelToolbar()(nextConfig));
