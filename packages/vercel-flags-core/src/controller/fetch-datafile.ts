import { version } from '../../package.json';
import type { BundledDefinitions } from '../types';
import type { Auth } from './auth';

const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 3;

class DatafileHttpError extends Error {
  constructor(
    readonly status: number,
    statusText: string,
  ) {
    super(`Failed to fetch data: ${statusText}`);
  }

  get retryable(): boolean {
    return this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

/**
 * Fetches the datafile with one deadline covering authentication, retries and
 * body parsing. Cancellation also settles transports that ignore the signal.
 */
export async function fetchDatafile(options: {
  host: string;
  auth: Auth;
  fetch: typeof globalThis.fetch;
  signal?: AbortSignal;
  /** Total attempts, including the initial request. Defaults to three. */
  maxAttempts?: number;
}): Promise<BundledDefinitions> {
  options.signal?.throwIfAborted();
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('maxAttempts must be a positive integer');
  }

  const controller = new AbortController();
  const { signal } = controller;
  let rejectAbort!: (reason: unknown) => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => rejectAbort(signal.reason);
  signal.addEventListener('abort', onAbort, { once: true });
  const onExternalAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });
  const timeoutId = setTimeout(
    () =>
      controller.abort(
        new Error('@vercel/flags-core: Datafile fetch deadline exceeded'),
      ),
    DEFAULT_FETCH_TIMEOUT_MS,
  );
  let delay: ReturnType<typeof setTimeout> | undefined;

  const fetchAttempt = async (): Promise<BundledDefinitions> => {
    const token = await options.auth.resolveToken();
    signal.throwIfAborted();
    const res = await options.fetch(`${options.host}/v1/datafile`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': `VercelFlagsCore/${version}`,
        ...(process.env.VERCEL_ENV
          ? { 'X-Vercel-Env': process.env.VERCEL_ENV }
          : null),
      },
      signal,
    });
    signal.throwIfAborted();
    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      throw new DatafileHttpError(res.status, res.statusText);
    }

    const data = (await res.json()) as BundledDefinitions;
    signal.throwIfAborted();
    return data;
  };

  try {
    for (let attempt = 0; ; attempt++) {
      if (attempt > 0) {
        await Promise.race([
          new Promise<void>((resolve) => {
            delay = setTimeout(resolve, 100 * 2 ** (attempt - 1));
          }),
          aborted,
        ]);
      }
      signal.throwIfAborted();
      try {
        return await Promise.race([fetchAttempt(), aborted]);
      } catch (error) {
        signal.throwIfAborted();
        if (
          attempt === maxAttempts - 1 ||
          (error instanceof DatafileHttpError && !error.retryable)
        ) {
          throw error instanceof Error
            ? error
            : new Error('Unknown fetch error');
        }
      }
    }
  } finally {
    clearTimeout(timeoutId);
    clearTimeout(delay);
    signal.removeEventListener('abort', onAbort);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}
