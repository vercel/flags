export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: 'PARSE_ERROR' | 'INVALID_CONTEXT' | 'GENERAL',
    message: string,
    readonly headers?: HeadersInit,
  ) {
    super(message);
  }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Enforce the limit while reading, including bodies without Content-Length. */
export async function readJson(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<unknown> {
  if (!body) throw new Error('Missing JSON body');
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('JSON body exceeds size limit');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export const responseHeaders = {
  'Cache-Control': 'private, no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'ETag, Retry-After, WWW-Authenticate',
};

export function options(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...responseHeaders,
      Allow: 'POST, OPTIONS',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers':
        'Authorization, X-API-Key, Content-Type, If-None-Match, X-Vercel-Flags-Project-Id',
      'Access-Control-Max-Age': '86400',
    },
  });
}
