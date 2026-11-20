import { withFlags } from '@flags-sdk/next/plugin';
import { withVercelToolbar } from '@vercel/toolbar/plugins/next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

// withFlags must be the outer plugin
export default withFlags(withVercelToolbar()(nextConfig));
