import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from './openapi';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

const document = buildOpenApiDocument({ origin: 'https://flags-sdk.dev' });

const operations = Object.entries(document.paths).flatMap(([path, item]) =>
  HTTP_METHODS.flatMap((method) => {
    const operation = (item as Record<string, unknown>)[method];
    return operation
      ? [{ path, method, operation: operation as Record<string, unknown> }]
      : [];
  }),
);

const collectRefs = (value: unknown, refs: string[] = []): string[] => {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRefs(item, refs);
    }
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (key === '$ref' && typeof entry === 'string') {
        refs.push(entry);
      } else {
        collectRefs(entry, refs);
      }
    }
  }
  return refs;
};

const resolveRef = (ref: string) =>
  ref
    .replace(/^#\//, '')
    .split('/')
    .reduce<unknown>(
      (node, segment) =>
        (node as Record<string, unknown> | undefined)?.[segment],
      document,
    );

describe('buildOpenApiDocument', () => {
  it('is an OpenAPI 3.1 document served from the given origin', () => {
    expect(document.openapi).toBe('3.1.0');
    expect(document.info.title).toBeTruthy();
    expect(document.info.version).toBeTruthy();
    expect(document.servers[0].url).toBe('https://flags-sdk.dev');
  });

  it('declares that no authentication is required', () => {
    expect(document.security).toEqual([]);
  });

  it('describes the search, chat, and discovery endpoints', () => {
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/api/search',
        '/api/chat',
        '/openapi.json',
        '/agents.md',
        '/llms.txt',
        '/sitemap.md',
      ]),
    );
  });

  it('gives every operation a unique operationId, summary, and description', () => {
    const ids = operations.map(({ operation }) => operation.operationId);

    expect(operations.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { operation } of operations) {
      expect(typeof operation.operationId).toBe('string');
      expect(typeof operation.summary).toBe('string');
      expect(typeof operation.description).toBe('string');
      expect(Array.isArray(operation.tags)).toBe(true);
    }
  });

  it('types every parameter and gives it a description', () => {
    for (const { operation } of operations) {
      for (const parameter of (operation.parameters ?? []) as Array<
        Record<string, unknown>
      >) {
        expect(parameter.name).toBeTruthy();
        expect(['query', 'path', 'header']).toContain(parameter.in);
        expect(parameter.schema).toBeDefined();
        expect(typeof parameter.description).toBe('string');
      }
    }
  });

  it('defines a response schema for every documented status code', () => {
    for (const { operation } of operations) {
      const responses = operation.responses as Record<string, unknown>;
      expect(Object.keys(responses).length).toBeGreaterThan(0);
      for (const response of Object.values(responses)) {
        const resolved =
          typeof (response as { $ref?: string }).$ref === 'string'
            ? resolveRef((response as { $ref: string }).$ref)
            : response;
        const content = (resolved as { content?: Record<string, unknown> })
          .content;
        expect(content).toBeDefined();
        for (const mediaType of Object.values(content ?? {})) {
          expect((mediaType as { schema?: unknown }).schema).toBeDefined();
        }
      }
    }
  });

  it('resolves every $ref to a component', () => {
    const refs = collectRefs(document);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref.startsWith('#/components/')).toBe(true);
      expect(resolveRef(ref), ref).toBeDefined();
    }
  });

  it('documents JSON error responses with code, message, and hint', () => {
    const error = document.components.schemas.Error;
    expect(error.properties.error.required).toEqual(
      expect.arrayContaining(['code', 'message']),
    );
    expect(error.properties.error.properties.hint).toBeDefined();
    expect(error.properties.error.properties.code.enum).toEqual(
      expect.arrayContaining(['not_found', 'method_not_allowed']),
    );
  });
});
