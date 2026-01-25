import { flagsClient } from '@vercel/flags-core';

export async function register() {
  await flagsClient.ensureFallback();
}
