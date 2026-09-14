import { version } from '../../package.json';
import type { BundledDefinitions } from '../types';
import type { Auth } from './auth';

const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetches the datafile from the flags service.
 */
export async function fetchDatafile(options: {
  host: string;
  auth: Auth;
  fetch: typeof globalThis.fetch;
  signal?: AbortSignal;
  /** Minimum configUpdatedAt advertised by the Edge Network. */
  minUpdatedAt?: number;
}): Promise<BundledDefinitions> {
  const token = await options.auth.resolveToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    DEFAULT_FETCH_TIMEOUT_MS,
  );

  // Abort the internal controller when the external signal fires
  const onExternalAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId);
      throw new Error('Fetch aborted');
    }
    options.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const res = await options.fetch(`${options.host}/v1/datafile`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': `VercelFlagsCore/${version}`,
        ...(process.env.VERCEL_ENV
          ? { 'X-Vercel-Env': process.env.VERCEL_ENV }
          : null),
        ...(options.minUpdatedAt !== undefined
          ? { 'X-Config-Min-Updated-At': String(options.minUpdatedAt) }
          : null),
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch data: ${res.statusText}`);
    }

    // Keep timeout and external cancellation active through body consumption.
    return (await res.json()) as BundledDefinitions;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Unknown fetch error');
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}
