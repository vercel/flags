import { flag } from '@vercel/flags/next';

export const exampleFlag = flag<boolean>({
  key: 'example-flag',
  decide: () => true,
  defaultValue: false,
  options: [false, true],
});

export const hostFlag = flag<string>({
  key: 'host',
  decide: ({ headers }) => headers.get('host') || 'no host',
  options: ['no host', 'localhost'],
});

export const cookieFlag = flag<string>({
  key: 'cookie',
  decide: ({ cookies }) => cookies.get('example-cookie')?.value || 'no cookie',
  options: ['no cookie'],
});

export const precomputedFlags = [exampleFlag, hostFlag, cookieFlag];
