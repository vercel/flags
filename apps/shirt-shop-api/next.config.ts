import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  async redirects() {
    return [
      {
        source: '/',
        destination: 'https://flags-sdk.dev',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
