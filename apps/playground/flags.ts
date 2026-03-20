import { vercelAdapter } from '@flags-sdk/vercel';
import { flag } from 'flags/next';

export const jsonFlag = flag({
  key: 'json-flag',
  adapter: vercelAdapter(),
});
