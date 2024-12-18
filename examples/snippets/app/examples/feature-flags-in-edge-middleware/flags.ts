import { flag } from '@vercel/flags/next';

export const basicEdgeMiddlewareFlag = flag({
  key: 'basic-edge-middleware-flag',
  decide({ cookies }) {
    return cookies.get('basic-edge-middleware-flag')?.value === '1';
  },
});
