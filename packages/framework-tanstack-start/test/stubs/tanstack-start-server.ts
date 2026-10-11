// A stand-in for the server module of TanStack Start in the tests. The tests
// mock it.
export function getRequest(): Request {
  throw new Error('Not in a request');
}
