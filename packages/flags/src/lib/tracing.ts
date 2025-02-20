import type {
  Tracer,
  Attributes,
  TracerProvider,
  AttributeValue,
} from '@opentelemetry/api';
import { name as pkgName, version } from '../../package.json';
import { AsyncLocalStorage } from 'async_hooks';

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

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any -- bc */
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
  } = {
    name: fn.name,
  },
): F {
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
                if (options.attributesError) {
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- k
                  span.setAttributes(options.attributesError(error));
                }

                span.setStatus({
                  code: 2, // 2 = Error
                  message: error instanceof Error ? error.message : undefined,
                });

                spanContext.getStore()?.forEach((value, key) => {
                  span.setAttribute(key, value);
                });

                span.end();
              });
          } else {
            if (options.attributesSuccess) {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- k
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
          if (options.attributesError) {
            span.setAttributes(options.attributesError(error as Error));
          }

          span.setStatus({
            code: 2, // 2 = Error
            message: error instanceof Error ? error.message : undefined,
          });

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
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any -- k */
