import { withVercelToolbar } from '@vercel/toolbar/plugins/next';

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    ppr: 'incremental' as const,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https' as const,
        hostname: 'assets.vercel.com',
        port: '',
        pathname: '/image/upload/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "frame-ancestors 'self' https://flags-sdk.com https://www.flags-sdk.com https://flags-sdk.dev https://www.flags-sdk.dev http://localhost:* https://*.vercel.sh",
          },
        ],
      },
    ];
  },
};

export default withVercelToolbar()(nextConfig);
