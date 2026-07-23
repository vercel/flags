import type {
  Attributes,
  AttributeValue,
  Span,
  Tracer,
  TracerProvider,
} from '@opentelemetry/api';
import { AsyncLocalStorage } from 'async_hooks';
import { name as pkgName, version } from '../../package.json';

// Use a symbol to avoid having global variable that is scoped to this file,
// as it can lead to issues with cjs and mjs being used at the same time.
const vercelFlagsTraceSymbol = Symbol.for('flags:global-trace');

/**
 * Allows setting the `@opentelemetry/api` tracer provider to generate traces
 * for `flags` operations.
 */
export function setTracerProvider(tracer: TracerProvider): void {
  Reflect.set(globalThis, vercelFlagsTraceSymbol, tracer);
}

function getTracer(): Tracer | undefined {
  const maybeTraceApi = Reflect.get(globalThis, vercelFlagsTraceSymbol) as
    | undefined
    | TracerProvider;
  return maybeTraceApi?.getTracer(pkgName, version);
}

function isPromise<T>(p: unknown): p is Promise<T> {
  return (
    p !== null &&
    typeof p === 'object' &&
    'then' in p &&
    typeof p.then === 'function'
  );
}

const spanContext = new AsyncLocalStorage<Map<string, AttributeValue>>();

export function setSpanAttribute(name: string, value: AttributeValue) {
  spanContext.getStore()?.set(name, value);
}

export function trace<F extends (...args: any) => any>(
  fn: F,
  options: {
    name: string;
    /** Defaults to `true`. If set to `false`, it'll trace regardless of `VERCEL_FLAGS_TRACE_VERBOSE`. */
    isVerboseTrace?: boolean;
    attributes?: Attributes;
    attributesSuccess?: (
      result: ReturnType<F> extends PromiseLike<infer U> ? U : ReturnType<F>,
    ) => Attributes;
    attributesError?: (error: Error) => Attributes;
    /**
     * Returns `true` for errors that are control flow rather than failures of
     * the traced function (e.g. framework redirects). When it returns `true`,
     * the span is not marked as errored and `attributesError` is not applied,
     * but the error still propagates to the caller. Deciding what counts as
     * control flow is left to the caller so this tracer stays framework-agnostic.
     */
    isIgnoredError?: (error: unknown) => boolean;
  } = {
    name: fn.name,
  },
): F {
  // Records an error on the span unless the caller classifies it as control
  // flow. Shared by the async-rejection and synchronous-throw paths below.
  const recordError = (span: Span, error: unknown): void => {
    if (options.isIgnoredError?.(error)) return;

    if (options.attributesError) {
      span.setAttributes(options.attributesError(error as Error));
    }

    span.setStatus({
      code: 2, // 2 = Error
      message: error instanceof Error ? error.message : undefined,
    });
  };
  const traced = function (this: unknown, ...args: unknown[]): unknown {
    const tracer = getTracer();
    if (!tracer) return fn.apply(this, args);

    const shouldTrace =
      process.env.VERCEL_FLAGS_TRACE_VERBOSE === 'true' ||
      options.isVerboseTrace === false;
    if (!shouldTrace) return fn.apply(this, args);

    return spanContext.run(new Map(), () =>
      tracer.startActiveSpan(options.name, (span) => {
        if (options.attributes) span.setAttributes(options.attributes);

        try {
          const result = fn.apply(this, args);

          if (isPromise(result)) {
            result
              .then((value) => {
                if (options.attributesSuccess) {
                  span.setAttributes(
                    options.attributesSuccess(
                      value as ReturnType<F> extends PromiseLike<infer U>
                        ? U
                        : ReturnType<F>,
                    ),
                  );
                }

                spanContext.getStore()?.forEach((value, key) => {
                  span.setAttribute(key, value);
                });

                span.setStatus({ code: 1 }); // 1 = Ok
                span.end();
              })
              .catch((error) => {
                recordError(span, error);

                spanContext.getStore()?.forEach((value, key) => {
                  span.setAttribute(key, value);
                });

                span.end();
              });
          } else {
            if (options.attributesSuccess) {
              span.setAttributes(options.attributesSuccess(result));
            }

            spanContext.getStore()?.forEach((value, key) => {
              span.setAttribute(key, value);
            });

            span.setStatus({ code: 1 }); // 1 = Ok
            span.end();
          }

          return result as unknown;
        } catch (error: any) {
          recordError(span, error);

          spanContext.getStore()?.forEach((value, key) => {
            span.setAttribute(key, value);
          });

          span.end();

          throw error;
        }
      }),
    );
  };

  return traced as unknown as F;
}
