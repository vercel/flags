import { flag } from '@vercel/flags/next';

export const hasAuthCookieFlag = flag<boolean>({
  key: 'has-auth-cookie',
  decide({ cookies }) {
    return cookies.has('suspense-fallbacks-user-id');
  },
});

export const coreFlags = [hasAuthCookieFlag];
