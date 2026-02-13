const MOCK_SERVER = process.env.FLAGS_MOCK_SERVER; // e.g. "http://localhost:8787"

/**
 * Wraps fetch to redirect flags.vercel.com requests to a local mock server.
 * Only active when FLAGS_MOCK_SERVER env var is set.
 */
export function wrapFetch(realFetch: typeof fetch): typeof fetch {
  if (!MOCK_SERVER) return realFetch;

  return (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.includes('flags.vercel.com')) {
      console.log('fake fetch called and intercepted', new URL(url).pathname);
      const redirected = url.replace(
        /^https?:\/\/flags\.vercel\.com/,
        'https://flags-none.vercel.com',
        // MOCK_SERVER,
      );
      return realFetch(redirected, init);
    }

    return realFetch(input, init);
  };
}
