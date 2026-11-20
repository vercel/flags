import { withFlags } from '@flags-sdk/next/plugin';
import withVercelToolbar from '@vercel/toolbar/plugins/next';

/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
};

// withFlags must be the outer plugin
export default withFlags(withVercelToolbar()(nextConfig));
