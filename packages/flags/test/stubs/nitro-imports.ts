// A stand-in for `#imports` of Nitro in the tests. The tests mock it.
export function useEvent(): { headers: Headers } {
  throw new Error('Not in a request');
}

export function getRequestURL(_event: unknown): URL {
  return new URL('http://localhost/');
}

export function defineNitroPlugin<T>(plugin: T): T {
  return plugin;
}
