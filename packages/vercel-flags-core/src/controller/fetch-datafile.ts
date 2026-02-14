import { version } from '../../package.json';
import type { BundledDefinitions } from '../types';
import { sleep } from '../utils/sleep';

export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
export const MAX_FETCH_RETRIES = 3;
export const FETCH_RETRY_BASE_DELAY_MS = 500;

/**
 * Fetches the datafile from the flags service with retry logic.
 *
 * Implements exponential backoff with jitter for transient failures.
 * Does not retry 4xx errors (except 429) as they indicate client errors.
 */
export async function fetchDatafile(
  host: string,
  sdkKey: string,
  fetchFn: typeof globalThis.fetch,
): Promise<BundledDefinitions> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_FETCH_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      DEFAULT_FETCH_TIMEOUT_MS,
    );

    let shouldRetry = true;
    try {
      const res = await fetchFn(`${host}/v1/datafile`, {
        headers: {
          Authorization: `Bearer ${sdkKey}`,
          'User-Agent': `VercelFlagsCore/${version}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        // Don't retry 4xx errors (except 429)
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          shouldRetry = false;
        }
        throw new Error(`Failed to fetch data: ${res.statusText}`);
      }

      return res.json() as Promise<BundledDefinitions>;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError =
        error instanceof Error ? error : new Error('Unknown fetch error');

      if (!shouldRetry) throw lastError;

      if (attempt < MAX_FETCH_RETRIES - 1) {
        const delay =
          FETCH_RETRY_BASE_DELAY_MS * 2 ** attempt + Math.random() * 500;
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('Failed to fetch data after retries');
}
