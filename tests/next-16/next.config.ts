import { withFlags } from '@flags-sdk/next/plugin';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
};

export default withFlags(nextConfig);
