import { version } from '../../package.json';
import type { BundledDefinitions } from '../types';

const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetches the datafile from the flags service.
 */
export async function fetchDatafile(options: {
  host: string;
  sdkKey: string;
  fetch: typeof globalThis.fetch;
  signal?: AbortSignal;
}): Promise<BundledDefinitions> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    DEFAULT_FETCH_TIMEOUT_MS,
  );

  // Abort the internal controller when the external signal fires
  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId);
      throw new Error('Fetch aborted');
    }
    options.signal.addEventListener('abort', () => controller.abort(), {
      once: true,
    });
  }

  try {
    const res = await options.fetch(`${options.host}/v1/datafile`, {
      headers: {
        Authorization: `Bearer ${options.sdkKey}`,
        'User-Agent': `VercelFlagsCore/${version}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Failed to fetch data: ${res.statusText}`);
    }

    return res.json() as Promise<BundledDefinitions>;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error instanceof Error ? error : new Error('Unknown fetch error');
  }
}
