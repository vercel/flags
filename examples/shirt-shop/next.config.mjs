import withVercelToolbar from '@vercel/toolbar/plugins/next';

/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/test',
          destination: '/api/discovery',
        },
        {
          source: '/.well-known/vercel/flags',
          destination: '/api/discovery',
        },
      ],
    };
  },
};

export default withVercelToolbar()(nextConfig);
