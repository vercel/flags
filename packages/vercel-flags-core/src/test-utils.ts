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
