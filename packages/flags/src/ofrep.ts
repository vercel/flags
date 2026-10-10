import type { EvaluationContext, Provider, ResolutionDetails } from './types';

export interface OfrepProviderOptions {
  /**
   * The URL before `/ofrep/v1/…`, e.g. `https://flags.example.com`.
   */
  readonly baseUrl: string;
  /**
   * The headers of each request, e.g. for the credential. Called for each
   * request, so the credential can change.
   */
  readonly headers?: () => HeadersInit | Promise<HeadersInit>;
  readonly name?: string;
  /**
   * The default is the global `fetch`.
   */
  readonly fetch?: typeof fetch;
}

/**
 * Creates an OpenFeature provider which evaluates each flag with the
 * OpenFeature Remote Evaluation Protocol (OFREP). It sends one request for
 * each evaluation, so it is for development, not for production.
 *
 * @see https://github.com/open-feature/protocol
 * @internal
 */
export function createOfrepProvider(options: OfrepProviderOptions): Provider {
  const baseUrl = options.baseUrl.replace(/\/$/, '');
  // Read the global fetch at each request, because a framework can replace
  // it after the provider is created, e.g. Next.js
  const fetchFlags: typeof fetch = (input, init) =>
    (options.fetch ?? globalThis.fetch)(input, init);
  // After a 429, no requests until this time
  let retryAt = 0;

  return {
    metadata: { name: options.name ?? 'ofrep' },

    async resolveBooleanEvaluation(
      flagKey: string,
      defaultValue: boolean,
      context: EvaluationContext,
    ): Promise<ResolutionDetails<boolean>> {
      const failure = (errorCode: string, errorMessage: string) => ({
        value: defaultValue,
        reason: 'ERROR',
        errorCode,
        errorMessage,
      });

      if (Date.now() < retryAt) {
        return failure(
          'GENERAL',
          `The OFREP server allows requests again at ${new Date(retryAt).toISOString()}.`,
        );
      }

      const response = await fetchFlags(
        `${baseUrl}/ofrep/v1/evaluate/flags/${encodeURIComponent(flagKey)}`,
        {
          method: 'POST',
          headers: {
            ...Object.fromEntries(new Headers(await options.headers?.())),
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({ context }),
        },
      );

      if (response.ok) {
        const body = (await response.json()) as Record<string, unknown>;
        // Without a value, the server asks for the default of the code
        if (!('value' in body))
          return { value: defaultValue, reason: 'DEFAULT' };
        return {
          value: body.value as boolean,
          reason: typeof body.reason === 'string' ? body.reason : undefined,
          variant: typeof body.variant === 'string' ? body.variant : undefined,
          flagMetadata: isMetadata(body.metadata) ? body.metadata : undefined,
        };
      }

      switch (response.status) {
        case 400: {
          const body = await response.json().catch(() => ({}));
          return failure(
            typeof body.errorCode === 'string' ? body.errorCode : 'GENERAL',
            typeof body.errorDetails === 'string'
              ? body.errorDetails
              : 'The OFREP server rejected the request.',
          );
        }
        case 401:
        case 403:
          return failure(
            'GENERAL',
            `The OFREP server did not accept the credential (status ${response.status}).`,
          );
        case 404:
          return failure(
            'FLAG_NOT_FOUND',
            `The flag "${flagKey}" does not exist.`,
          );
        case 429:
          retryAt = parseRetryAfter(response.headers.get('retry-after'));
          return failure(
            'GENERAL',
            'The OFREP server received too many requests.',
          );
        default:
          return failure(
            'GENERAL',
            `The OFREP server returned status ${response.status}.`,
          );
      }
    },
  };
}

/**
 * `Retry-After` is a number of seconds or a date. Without a valid value, the
 * provider waits for one second.
 */
function parseRetryAfter(value: string | null): number {
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Date.now() + seconds * 1000;
    }
    const date = Date.parse(value);
    if (Number.isFinite(date)) return date;
  }
  return Date.now() + 1000;
}

function isMetadata(
  value: unknown,
): value is Record<string, string | number | boolean> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) =>
      ['string', 'number', 'boolean'].includes(typeof item),
    )
  );
}
