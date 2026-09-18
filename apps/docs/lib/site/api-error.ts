export type ApiErrorCode =
  | 'bad_request'
  | 'not_found'
  | 'method_not_allowed'
  | 'internal_error';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    hint?: string;
    docs: string;
  };
}

const ERROR_DOCS_PATH = '/openapi.json';

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
    docs: ERROR_DOCS_PATH,
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
    hint: 'List the available operations in the OpenAPI document at /openapi.json.',
  });

export const methodNotAllowedError = (method: string, allow: string[]) =>
  jsonError({
    status: 405,
    code: 'method_not_allowed',
    message: `${method} is not supported on this route.`,
    hint: `Use ${allow.join(' or ')} instead.`,
    headers: { Allow: allow.join(', ') },
  });
