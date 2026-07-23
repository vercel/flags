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

  it('does not mark the span as errored when isIgnoredError matches a rejection', async () => {
    const span = createMockSpan();
    installMockTracer(span);

    const ignored = new Error('control flow');
    const traced = trace(() => Promise.reject(ignored), {
      name: 'test',
      isVerboseTrace: false,
      isIgnoredError: (error) => error === ignored,
    });

    // Control flow is preserved: the rejection still propagates to the caller.
    await expect(traced()).rejects.toBe(ignored);
    await flushMicrotasks();

    expect(span.setStatus).not.toHaveBeenCalled();
    expect(span.end).toHaveBeenCalledOnce();
  });

  it('does not mark the span as errored when isIgnoredError matches a synchronous throw', () => {
    const span = createMockSpan();
    installMockTracer(span);

    const ignored = new Error('control flow');
    const traced = trace(
      () => {
        throw ignored;
      },
      {
        name: 'test',
        isVerboseTrace: false,
        isIgnoredError: (error) => error === ignored,
      },
    );

    expect(() => traced()).toThrow(ignored);
    expect(span.setStatus).not.toHaveBeenCalled();
    expect(span.end).toHaveBeenCalledOnce();
  });

  it('does not apply attributesError for ignored errors', async () => {
    const span = createMockSpan();
    installMockTracer(span);

    const ignored = new Error('control flow');
    const attributesError = vi.fn(() => ({ 'error.kind': 'control-flow' }));
    const traced = trace(() => Promise.reject(ignored), {
      name: 'test',
      isVerboseTrace: false,
      isIgnoredError: () => true,
      attributesError,
    });

    await expect(traced()).rejects.toBe(ignored);
    await flushMicrotasks();

    expect(attributesError).not.toHaveBeenCalled();
  });
});
