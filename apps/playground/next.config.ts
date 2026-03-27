import createWithVercelToolbar from '@vercel/toolbar/plugins/next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
};

const withVercelToolbar = createWithVercelToolbar();
export default withVercelToolbar(nextConfig);
