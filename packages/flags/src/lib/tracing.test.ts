import type { Span, Tracer, TracerProvider } from '@opentelemetry/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setTracerProvider, trace } from './tracing';

function createMockSpan() {
  return {
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
    setStatus: vi.fn(),
    end: vi.fn(),
  } as unknown as Span & {
    setStatus: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
}

function installMockTracer(span: Span) {
  const tracer = {
    startActiveSpan: (_name: string, fn: (span: Span) => unknown) => fn(span),
  } as unknown as Tracer;

  setTracerProvider({
    getTracer: () => tracer,
  } as unknown as TracerProvider);
}

// Flush the microtask queue so the span bookkeeping attached to the traced
// promise has run before we assert on the span.
function flushMicrotasks() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('trace', () => {
  afterEach(() => {
    setTracerProvider(undefined as unknown as TracerProvider);
  });

  it('marks the span as errored when the traced function rejects', async () => {
    const span = createMockSpan();
    installMockTracer(span);

    const error = new Error('boom');
    const traced = trace(() => Promise.reject(error), {
      name: 'test',
      isVerboseTrace: false,
    });

    await expect(traced()).rejects.toThrow('boom');
    await flushMicrotasks();

    expect(span.setStatus).toHaveBeenCalledWith({
      code: 2,
      message: 'boom',
    });
    expect(span.end).toHaveBeenCalledOnce();
  });

  it('does not mark the span as errored for internal Next.js errors', async () => {
    const span = createMockSpan();
    installMockTracer(span);

    // Mirrors the HangingPromiseRejectionError thrown when a prerender is
    // aborted while the traced function awaits connection() or cookies().
    const hangingPromiseRejection = Object.assign(
      new Error(
        'During prerendering, `connection()` rejects when the prerender is complete.',
      ),
      { digest: 'HANGING_PROMISE_REJECTION' },
    );

    const traced = trace(() => Promise.reject(hangingPromiseRejection), {
      name: 'test',
      isVerboseTrace: false,
    });

    // Control flow is preserved: the rejection still propagates to the caller.
    await expect(traced()).rejects.toBe(hangingPromiseRejection);
    await flushMicrotasks();

    expect(span.setStatus).not.toHaveBeenCalled();
    expect(span.end).toHaveBeenCalledOnce();
  });

  it('does not mark the span as errored for internal Next.js errors thrown synchronously', () => {
    const span = createMockSpan();
    installMockTracer(span);

    const redirectError = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/login;307;',
    });

    const traced = trace(
      () => {
        throw redirectError;
      },
      { name: 'test', isVerboseTrace: false },
    );

    expect(() => traced()).toThrow(redirectError);
    expect(span.setStatus).not.toHaveBeenCalled();
    expect(span.end).toHaveBeenCalledOnce();
  });
});
