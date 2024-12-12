import { flag } from '@vercel/flags/next';

export const hasAuthCookieFlag = flag({
  key: 'hasAuthCookie',
  // defaultValue: false,
  // options: [false, true],
  // description: 'checks auth',
  // origin: 'https://example.com/#hasAuthCookie',
  async decide({ cookies }) {
    return cookies.get('fake-auth-cookie')?.value === '1';
  },
});

export const showRatingFlag = flag({
  key: 'showRating',
  // defaultValue: false,
  // options: [false, true],
  async decide() {
    return false;
  },
});

export const footerFlag = flag<{
  url: string;
  text: string;
}>({
  key: 'jsonFlag',
  options: [
    {
      label: 'Website',
      value: { url: 'https://vercel.com/', text: 'vercel.com' },
    },
    {
      label: 'Twitter',
      value: { url: 'https://twitter.com/vercel', text: '@vercel' },
    },
  ],
  async decide() {
    return { url: 'https://vercel.com/', text: 'vercel.com' };

    // alternatively we could return from the options list directly
    // return this.options[0].value;
  },
});

export const precomputeFlags = [
  hasAuthCookieFlag,
  showRatingFlag,
  footerFlag,
] as const;
