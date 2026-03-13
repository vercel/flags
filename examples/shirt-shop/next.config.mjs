import withVercelToolbar from '@vercel/toolbar/plugins/next';

/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
};

export default withVercelToolbar()(nextConfig);
