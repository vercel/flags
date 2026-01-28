import withVercelToolbar from '@vercel/toolbar/plugins/next';

/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    serverComponentsHmrCache: false,
  },
};

export default withVercelToolbar()(nextConfig);
