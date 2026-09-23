import { version } from '../../package.json';
import type { BundledDefinitions } from '../types';
import type { Auth } from './auth';
import { debug } from './debug';

const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetches the datafile from the flags service.
 */
export async function fetchDatafile(options: {
  host: string;
  auth: Auth;
  fetch: typeof globalThis.fetch;
  signal?: AbortSignal;
}): Promise<BundledDefinitions> {
  debug('datafile.fetch.start');
  const token = await options.auth.resolveToken().catch((error) => {
    debug('datafile.auth.failed');
    throw error;
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    debug('datafile.fetch.timeout');
    controller.abort();
  }, DEFAULT_FETCH_TIMEOUT_MS);

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
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', onExternalAbort);

    debug('datafile.fetch.response', () => ({ status: res.status }));
    if (!res.ok) {
      throw new Error(`Failed to fetch data: ${res.statusText}`);
    }

    return res.json() as Promise<BundledDefinitions>;
  } catch (error) {
    debug(
      controller.signal.aborted
        ? 'datafile.fetch.aborted'
        : 'datafile.fetch.failed',
    );
    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', onExternalAbort);
    throw error instanceof Error ? error : new Error('Unknown fetch error');
  }
}
