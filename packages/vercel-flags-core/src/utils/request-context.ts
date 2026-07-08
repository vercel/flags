interface RequestContext {
  ctx: object | undefined;
  headers: Record<string, string> | undefined;
}

const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');
const fromSymbol = globalThis as typeof globalThis & {
  [key: symbol]:
    | { get?: () => { headers?: Record<string, string> } }
    | undefined;
};

/**
 * Gets the Vercel request context and headers from the global symbol.
 */
export function getRequestContext(): RequestContext {
  try {
    const ctx = fromSymbol[SYMBOL_FOR_REQ_CONTEXT]?.get?.();
    if (ctx && Object.hasOwn(ctx, 'headers')) {
      return {
        ctx,
        headers: ctx.headers as Record<string, string>,
      };
    }
    return { ctx, headers: undefined };
  } catch {
    return { ctx: undefined, headers: undefined };
  }
}
