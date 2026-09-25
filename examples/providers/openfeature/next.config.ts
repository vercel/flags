import { withVercelToolbar } from '@vercel/toolbar/plugins/next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default withVercelToolbar()(nextConfig);
