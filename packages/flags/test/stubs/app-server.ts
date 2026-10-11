// A stand-in for `$app/server` of SvelteKit in the tests. The tests mock it.
export function getRequestEvent(): { request: Request; url: URL } {
  throw new Error('Not in a request');
}
