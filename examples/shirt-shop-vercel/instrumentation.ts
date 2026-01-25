import { getDefaultFlagsClient } from '@vercel/flags-core';

export async function register() {
  await getDefaultFlagsClient().ensureFallback();
}
