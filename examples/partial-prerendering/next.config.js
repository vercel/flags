const withVercelToolbar = require('@vercel/toolbar/plugins/next');

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    ppr: true,
  },
};

module.exports = withVercelToolbar()(nextConfig);
