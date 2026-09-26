export type ApiErrorCode = 'not_found' | 'method_not_allowed';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    hint?: string;
  };
}

export const createApiErrorBody = ({
  code,
  message,
  hint,
}: {
  code: ApiErrorCode;
  message: string;
  hint?: string;
}): ApiErrorBody => ({
  error: {
    code,
    message,
    ...(hint ? { hint } : {}),
  },
});

export const jsonError = ({
  status,
  headers,
  ...body
}: {
  status: number;
  code: ApiErrorCode;
  message: string;
  hint?: string;
  headers?: HeadersInit;
}) =>
  Response.json(createApiErrorBody(body), {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      ...headers,
    },
  });

export const notFoundError = (pathname: string) =>
  jsonError({
    status: 404,
    code: 'not_found',
    message: `No API route exists at ${pathname}.`,
    hint: 'This site only serves /api/search and /api/chat. Documentation is available as Markdown at /agents.md and /llms.txt.',
  });

export const methodNotAllowedError = (method: string, allow: string[]) =>
  jsonError({
    status: 405,
    code: 'method_not_allowed',
    message: `${method} is not supported on this route.`,
    hint: `Use ${allow.join(' or ')} instead.`,
    headers: { Allow: allow.join(', ') },
  });
