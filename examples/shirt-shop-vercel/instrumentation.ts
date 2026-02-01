import { flagsClient } from '@vercel/flags-core';

export async function register() {
  if (process.env.CI === '1') {
    const fallback = await flagsClient.getFallbackDatafile();
    if (!fallback) throw new Error('Missing fallback datafile');
  }
}
