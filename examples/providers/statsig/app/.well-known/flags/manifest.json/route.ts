// The manifest of the flags of all 'use flags' modules, for Flags Explorer.
// In development, this route returns it. next build writes it into
// .next/flags-manifest.json, and the route returns 404 in production.
export { GET } from '@flags-sdk/next/manifest';
