import { flag } from 'flags/next';

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

/**
 * Deliberately does not read `headers` or `cookies`, and resolves to a
 * different value on every evaluation.
 *
 * A page rendering this flag may therefore never be statically generated. The
 * SDK is what guarantees that: it awaits `headers()` and `cookies()` before
 * calling `decide`, which is why no `await connection()` is needed in user
 * land.
 */
export const requestScopedFlag = flag<string>({
  key: 'request-scoped',
  decide: () => Math.random().toString(36).slice(2),
});

export const precomputedFlags = [exampleFlag, hostFlag, cookieFlag];
