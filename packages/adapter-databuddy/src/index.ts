/**
 * @vercel/flags-adapter-databuddy
 *
 * Databuddy adapter for Vercel Flags SDK
 *
 * @example
 * ```typescript
 * // In your flags API route (.well-known/vercel/flags/route.ts)
 * import { getProviderData } from '@vercel/flags-adapter-databuddy/provider';
 *
 * export async function GET() {
 *   const data = await getProviderData({
 *     clientId: process.env.DATABUDDY_CLIENT_ID!,
 *     apiKey: process.env.DATABUDDY_API_KEY!,
 *     environment: process.env.NODE_ENV || 'production',
 *   });
 *   return Response.json(data);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // In your flag definitions
 * import { flag } from 'flags/next';
 * import { createDatabuddyAdapter } from '@vercel/flags-adapter-databuddy';
 *
 * const adapter = createDatabuddyAdapter({
 *   clientId: process.env.DATABUDDY_CLIENT_ID!,
 *   apiKey: process.env.DATABUDDY_API_KEY,
 *   environment: process.env.NODE_ENV || 'production',
 * });
 *
 * export const showNewFeature = flag({
 *   key: 'show-new-feature',
 *   adapter,
 *   defaultValue: false,
 *   description: 'Show the new feature to users',
 * });
 * ```
 */

export { createDatabuddyAdapter } from './adapter';
export type { DatabuddyAdapterOptions } from './adapter';
