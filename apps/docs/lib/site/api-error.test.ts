import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  GET as apiNotFound,
  POST as apiNotFoundPost,
} from '@/app/api/[[...path]]/route';
import {
  createApiErrorBody,
  jsonError,
  methodNotAllowedError,
  notFoundError,
} from './api-error';

describe('createApiErrorBody', () => {
  it('returns code, message, and docs, and omits hint when absent', () => {
    expect(createApiErrorBody({ code: 'bad_request', message: 'Bad' })).toEqual(
      {
        error: { code: 'bad_request', message: 'Bad', docs: '/openapi.json' },
      },
    );
  });

  it('includes hint when provided', () => {
    expect(
      createApiErrorBody({ code: 'not_found', message: 'Gone', hint: 'Look' })
        .error.hint,
    ).toBe('Look');
  });
});

describe('jsonError', () => {
  it('returns a JSON response with the given status and no-store caching', async () => {
    const response = jsonError({
      status: 418,
      code: 'internal_error',
      message: 'Teapot',
    });

    expect(response.status).toBe(418);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'internal_error',
        message: 'Teapot',
        docs: '/openapi.json',
      },
    });
  });
});

describe('notFoundError', () => {
  it('returns a 404 JSON error pointing to the OpenAPI document', async () => {
    const response = notFoundError('/api/unknown');
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('not_found');
    expect(body.error.message).toContain('/api/unknown');
    expect(body.error.hint).toContain('/openapi.json');
  });
});

describe('methodNotAllowedError', () => {
  it('returns a 405 JSON error with an Allow header', async () => {
    const response = methodNotAllowedError('GET', ['POST', 'PUT']);
    const body = await response.json();

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST, PUT');
    expect(body.error.code).toBe('method_not_allowed');
    expect(body.error.hint).toBe('Use POST or PUT instead.');
  });
});

describe('/api catch-all route', () => {
  it('returns a JSON 404 for unknown API paths on any method', async () => {
    const request = new NextRequest('https://flags-sdk.dev/api/does-not-exist');

    for (const handler of [apiNotFound, apiNotFoundPost]) {
      const response = handler(request);
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toContain(
        'application/json',
      );
      const body = await response.json();
      expect(body.error.code).toBe('not_found');
      expect(body.error.message).toContain('/api/does-not-exist');
    }
  });
});
