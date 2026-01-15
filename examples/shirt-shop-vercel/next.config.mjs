import withVercelToolbar from '@vercel/toolbar/plugins/next';

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // disabled until @vercel/edge-config can be used
    // in proxy.ts with cacheComponents enabled
    cacheComponents: false,
  },
};

export default withVercelToolbar()(nextConfig);
