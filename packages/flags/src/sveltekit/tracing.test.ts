import crypto from 'node:crypto';
import type { TracerProvider } from '@opentelemetry/api';
import { error, isHttpError, isRedirect, redirect } from '@sveltejs/kit';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { encryptOverrides } from '..';
import { setTracerProvider } from '../lib/tracing';
import { createHandle, flag, precompute } from '.';

vi.mock('$env/dynamic/private', () => ({ FLAGS_SECRET: 'secret' }));

interface RecordedSpan {
  name: string;
  attributes: Record<string, unknown>;
  status?: { code: number; message?: string };
  ended: boolean;
}

const traceSymbol = Symbol.for('flags:global-trace');

/**
 * Installs a recording tracer provider for the current test and restores the
 * previous provider when the test finishes.
 */
function recordSpans(): RecordedSpan[] {
  const previous = Reflect.get(globalThis, traceSymbol);
  onTestFinished(() => {
    if (previous === undefined) {
      Reflect.deleteProperty(globalThis, traceSymbol);
    } else {
      Reflect.set(globalThis, traceSymbol, previous);
    }
  });

  const spans: RecordedSpan[] = [];
  const tracer = {
    startActiveSpan(name: string, fn: (span: unknown) => unknown) {
      const record: RecordedSpan = { name, attributes: {}, ended: false };
      spans.push(record);
      return fn({
        setAttributes(attrs: Record<string, unknown>) {
          Object.assign(record.attributes, attrs);
        },
        setAttribute(key: string, value: unknown) {
          record.attributes[key] = value;
        },
        setStatus(status: { code: number; message?: string }) {
          record.status = status;
        },
        end() {
          record.ended = true;
        },
      });
    },
  };
  setTracerProvider({ getTracer: () => tracer } as unknown as TracerProvider);
  return spans;
}

/**
 * Span bookkeeping for a rejected promise runs on a detached `.then().catch()`
 * chain, one tick after the caller sees the rejection.
 */
function spansSettled(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const secret = crypto.randomBytes(32).toString('base64url');

async function inHandle<T>(request: Request, fn: () => Promise<T>): Promise<T> {
  const handle = createHandle({ secret });
  let result: T | undefined;
  await handle({
    event: { request, params: {} } as any,
    resolve: (async () => {
      result = await fn();
      return new Response('ok');
    }) as any,
  });
  return result as T;
}

describe('tracing', () => {
  it('emits one flag span with key and method decided', async () => {
    const identify = vi.fn(() => ({ user: 'u' }));
    const a = flag<string>({ key: 'a', identify, decide: () => 'A' });
    const b = flag<string>({ key: 'b', identify, decide: () => 'B' });
    const spans = recordSpans();
    const request = new Request('https://example.com');

    await expect(a(request, secret)).resolves.toBe('A');
    await expect(b(request, secret)).resolves.toBe('B');

    expect(identify).toHaveBeenCalledTimes(1);
    expect(spans.map((s) => s.name)).toEqual(['flag', 'flag']);
    expect(spans[0]).toMatchObject({
      attributes: { key: 'a', method: 'decided' },
      status: { code: 1 },
      ended: true,
    });
  });

  it('records cached on the second call in the same request', async () => {
    const decide = vi.fn(() => 'A');
    const a = flag<string>({ key: 'a', decide });
    const spans = recordSpans();
    const request = new Request('https://example.com');

    await a(request, secret);
    await a(request, secret);

    expect(decide).toHaveBeenCalledTimes(1);
    expect(spans.map((s) => s.attributes.method)).toEqual([
      'decided',
      'cached',
    ]);
  });

  it('records override', async () => {
    const a = flag<string>({ key: 'a', decide: () => 'A' });
    const override = await encryptOverrides({ a: 'forced' }, secret);
    const spans = recordSpans();
    const request = new Request('https://example.com', {
      headers: { cookie: `vercel-flag-overrides=${override}` },
    });

    await expect(a(request, secret)).resolves.toBe('forced');
    expect(spans[0]!.attributes).toMatchObject({
      key: 'a',
      method: 'override',
    });
  });

  it('precompute emits evaluate with flagCount and precomputed reads', async () => {
    const a = flag<boolean>({ key: 'a', decide: () => true });
    const request = new Request('https://example.com');
    const spans = recordSpans();

    const value = await inHandle(request, async () => {
      const code = await precompute([a], request, secret);
      return a(code, [a]);
    });

    expect(value).toBe(true);
    expect(spans.map((s) => [s.name, s.attributes.method])).toEqual([
      ['evaluate', undefined],
      ['flag', 'decided'],
      ['flag', 'precomputed'],
    ]);
    expect(spans[0]!.attributes.flagCount).toBe(1);
  });

  it('keeps redirect() spans Ok and propagates it', async () => {
    const a = flag<string>({
      key: 'a',
      decide: () => redirect(307, '/login'),
    });
    const spans = recordSpans();

    await expect(a(new Request('https://e.com'), secret)).rejects.toSatisfy(
      isRedirect,
    );
    await spansSettled();

    expect(spans[0]!.status).toEqual({ code: 1 });
    expect(spans[0]!.attributes.method).toBe('decided');
  });

  it('keeps error() from identify Ok and propagates it', async () => {
    const a = flag<string>({
      key: 'a',
      identify: () => error(404, 'nope'),
      decide: () => 'A',
    });
    const spans = recordSpans();

    await expect(a(new Request('https://e.com'), secret)).rejects.toSatisfy(
      (e: unknown) => isHttpError(e, 404),
    );
    await spansSettled();

    expect(spans[0]!.status).toEqual({ code: 1 });
  });

  it('recognises a Redirect from another @sveltejs/kit copy', async () => {
    class Redirect {
      constructor(
        public status: number,
        public location: string,
      ) {}
    }
    const thrown = new Redirect(303, '/elsewhere');
    const a = flag<string>({
      key: 'a',
      decide: () => {
        throw thrown;
      },
    });
    const spans = recordSpans();

    await expect(a(new Request('https://e.com'), secret)).rejects.toBe(thrown);
    await spansSettled();

    expect(isRedirect(thrown)).toBe(false);
    expect(spans[0]!.status).toEqual({ code: 1 });
  });

  it('does not treat a thrown Response as SvelteKit control flow', async () => {
    const thrown = new Response('teapot', { status: 418 });
    const a = flag<string>({
      key: 'a',
      decide: () => {
        throw thrown;
      },
    });
    const spans = recordSpans();

    await expect(a(new Request('https://e.com'), secret)).rejects.toBe(thrown);
    await spansSettled();

    expect(spans[0]!.status).toEqual({ code: 2, message: undefined });
  });

  it('marks real failures as Error', async () => {
    const a = flag<string>({
      key: 'a',
      decide: () => {
        throw new Error('boom');
      },
    });
    const spans = recordSpans();

    await expect(a(new Request('https://e.com'), secret)).rejects.toThrow(
      'boom',
    );
    await spansSettled();

    expect(spans[0]!.status).toEqual({ code: 2, message: 'boom' });
  });

  it('marks missing context as Error without a method', async () => {
    const a = flag<string>({ key: 'a', decide: () => 'A' });
    const spans = recordSpans();

    await expect(a()).rejects.toThrow('Neither context found');
    await spansSettled();

    expect(spans[0]!.status).toMatchObject({ code: 2 });
    expect(spans[0]!.attributes).toEqual({ key: 'a' });
  });

  it('precompute keeps evaluate Ok when a flag redirects', async () => {
    const a = flag<string>({ key: 'a', decide: () => redirect(303, '/x') });
    const request = new Request('https://example.com');
    const spans = recordSpans();

    const rejection = await inHandle(request, () =>
      precompute([a], request, secret).catch((e: unknown) => e),
    );
    await spansSettled();

    expect(isRedirect(rejection)).toBe(true);
    expect(spans.map((s) => [s.name, s.status?.code])).toEqual([
      ['evaluate', 1],
      ['flag', 1],
    ]);
  });

  it('does not treat a plain redirect-shaped object as control flow', async () => {
    const thrown = { status: 302, location: '/x' };
    const a = flag<string>({
      key: 'a',
      decide: () => {
        throw thrown;
      },
    });
    const spans = recordSpans();

    await expect(a(new Request('https://e.com'), secret)).rejects.toBe(thrown);
    await spansSettled();

    expect(spans[0]!.status).toEqual({ code: 2, message: undefined });
  });

  it('does not treat an Error with redirect fields as control flow', async () => {
    const thrown = Object.assign(new Error('boom'), {
      status: 302,
      location: '/x',
    });
    const a = flag<string>({
      key: 'a',
      decide: () => {
        throw thrown;
      },
    });
    const spans = recordSpans();

    await expect(a(new Request('https://e.com'), secret)).rejects.toBe(thrown);
    await spansSettled();

    expect(spans[0]!.status).toEqual({ code: 2, message: 'boom' });
  });

  it('does not treat an action-failure shape as control flow', async () => {
    const thrown = { status: 400, data: { message: 'no' } };
    const a = flag<string>({
      key: 'a',
      decide: () => {
        throw thrown;
      },
    });
    const spans = recordSpans();

    await expect(a(new Request('https://e.com'), secret)).rejects.toBe(thrown);
    await spansSettled();

    expect(spans[0]!.status).toMatchObject({ code: 2 });
  });

  it('does not swallow a decide throw when defaultValue is set', async () => {
    const thrown = new Error('boom');
    const a = flag<string>({
      key: 'a',
      defaultValue: 'fallback',
      decide: () => {
        throw thrown;
      },
    });
    const spans = recordSpans();

    await expect(a(new Request('https://e.com'), secret)).rejects.toBe(thrown);
    await spansSettled();

    expect(a).toHaveProperty('defaultValue', 'fallback');
    expect(spans[0]!.status).toEqual({ code: 2, message: 'boom' });
  });

  it('does not stamp method when override decrypt throws', async () => {
    const a = flag<string>({ key: 'a', decide: () => 'A' });
    const spans = recordSpans();
    const request = new Request('https://example.com', {
      headers: { cookie: 'vercel-flag-overrides=not-a-jwe' },
    });

    await expect(a(request, 'too-short')).rejects.toThrow('Invalid secret');
    await spansSettled();

    expect(spans[0]!.status).toMatchObject({ code: 2 });
    expect(spans[0]!.attributes).toEqual({ key: 'a' });
  });

  it('stamps precomputed before a bad code rejects', async () => {
    const a = flag<string>({ key: 'a', decide: () => 'A' });
    const request = new Request('https://example.com');
    const spans = recordSpans();

    const rejection = await inHandle(request, async () => {
      try {
        return await a('not-a-code', [a]);
      } catch (e) {
        return e;
      }
    });
    await spansSettled();

    expect(rejection).toBeInstanceOf(Error);
    expect(spans[0]!.attributes.method).toBe('precomputed');
    expect(spans[0]!.status).toMatchObject({ code: 2 });
  });

  it('caches a rejected decide and reports the second call as cached', async () => {
    const decide = vi.fn(() => Promise.reject(new Error('boom')));
    const a = flag<string>({ key: 'a', decide });
    const spans = recordSpans();
    const request = new Request('https://example.com');

    await expect(a(request, secret)).rejects.toThrow('boom');
    await expect(a(request, secret)).rejects.toThrow('boom');
    await spansSettled();

    expect(decide).toHaveBeenCalledTimes(1);
    expect(spans.map((s) => [s.attributes.method, s.status?.code])).toEqual([
      ['decided', 2],
      ['cached', 2],
    ]);
  });

  it('does not cache a synchronous redirect', async () => {
    const decide = vi.fn(() => redirect(307, '/login'));
    const a = flag<string>({ key: 'a', decide });
    const spans = recordSpans();
    const request = new Request('https://example.com');

    await expect(a(request, secret)).rejects.toSatisfy(isRedirect);
    await expect(a(request, secret)).rejects.toSatisfy(isRedirect);
    await spansSettled();

    expect(decide).toHaveBeenCalledTimes(2);
    expect(spans.map((s) => s.attributes.method)).toEqual([
      'decided',
      'decided',
    ]);
  });

  it('without a provider returns the same values and errors', async () => {
    const thrown = new Error('boom');
    const ok = flag<string>({ key: 'ok', decide: () => 'A' });
    const bad = flag<string>({
      key: 'bad',
      decide: () => {
        throw thrown;
      },
    });
    const request = new Request('https://e.com');

    await expect(ok(request, secret)).resolves.toBe('A');
    await expect(bad(request, secret)).rejects.toBe(thrown);
  });
});
