const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');

/**
 * Installs a fake Vercel request context on `globalThis`.
 * Returns a cleanup function that removes it.
 */
export function setRequestContext(headers: Record<string, string>): () => void {
  const mockContext = { headers };
  (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = {
    get: () => mockContext,
  };
  return () => {
    delete (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT];
  };
}

/** A controllable response for testing reads while transport is pending. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
