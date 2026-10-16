import { createHash } from 'node:crypto';
import { createDatafileLoader } from './datafile';
import { evaluateFlag } from './evaluate';
import { HttpError, isObject, readJson, responseHeaders } from './http';

async function readContext(request: Request): Promise<Record<string, unknown>> {
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
    'application/json'
  ) {
    throw new HttpError(
      400,
      'PARSE_ERROR',
      'Use an application/json request body.',
    );
  }
  let body: unknown;
  try {
    body = await readJson(request.body, 64 * 1024);
  } catch {
    throw new HttpError(
      400,
      'PARSE_ERROR',
      'The request must contain valid JSON of at most 64 KiB.',
    );
  }
  if (
    !isObject(body) ||
    !isObject(body.context) ||
    ('targetingKey' in body.context &&
      typeof body.context.targetingKey !== 'string')
  ) {
    throw new HttpError(
      400,
      'INVALID_CONTEXT',
      'Provide a context object with an optional string targetingKey.',
    );
  }
  return body.context;
}

export function createHandler(loadDatafile = createDatafileLoader()) {
  return async (request: Request, key?: string): Promise<Response> => {
    try {
      const context = await readContext(request);
      const data = await loadDatafile(request);
      if (key !== undefined) {
        if (!Object.hasOwn(data.definitions, key)) {
          return Response.json(
            { key, errorCode: 'FLAG_NOT_FOUND' },
            { status: 404, headers: responseHeaders },
          );
        }
        const result = evaluateFlag(data, key, context);
        if ('errorCode' in result) {
          return Response.json(
            { errorDetails: result.errorDetails },
            { status: 500, headers: responseHeaders },
          );
        }
        return Response.json(result, {
          headers: responseHeaders,
        });
      }

      const body = JSON.stringify({
        flags: Object.keys(data.definitions)
          .sort()
          .map((flagKey) => evaluateFlag(data, flagKey, context)),
      });
      // Hash evaluated values, reasons, variants and failures, not just the datafile.
      // Thus a context change cannot reuse results for another subject.
      const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
      const headers = { ...responseHeaders, ETag: etag };
      const matches = request.headers
        .get('if-none-match')
        ?.split(',')
        .some((tag) => {
          const candidate = tag.trim().replace(/^W\//, '');
          return candidate === '*' || candidate === etag;
        });
      if (matches) return new Response(null, { status: 304, headers });
      return new Response(body, {
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      const known = error instanceof HttpError;
      const status = known ? error.status : 500;
      const body =
        known && status === 400
          ? {
              ...(key !== undefined ? { key } : {}),
              errorCode: error.code,
              errorDetails: error.message,
            }
          : {
              errorDetails: known
                ? error.message
                : 'An internal server error prevented flag evaluation.',
            };
      return Response.json(body, {
        status,
        headers: {
          ...responseHeaders,
          ...(known ? Object.fromEntries(new Headers(error.headers)) : {}),
        },
      });
    }
  };
}

export const handleEvaluation = createHandler();
