import { withFlags } from '@flags-sdk/next/plugin';
import { withVercelToolbar } from '@vercel/toolbar/plugins/next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

// withFlags must be the outer plugin. It gives the request of each page to
// the SDK, and registers the 'use flags' modules for Flags Explorer.
export default withFlags(withVercelToolbar()(nextConfig));
