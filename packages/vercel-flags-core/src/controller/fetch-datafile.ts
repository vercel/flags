import { version } from '../../package.json';
import type { BundledDefinitions } from '../types';

const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
/** Maximum response body size in bytes (10 MB) to prevent memory exhaustion */
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;

/**
 * Validates that a host URL uses https protocol.
 */
function validateHost(host: string): void {
  try {
    const url = new URL(host);
    if (url.protocol !== 'https:') {
      throw new Error(
        `@vercel/flags-core: Invalid host protocol "${url.protocol}", must be https`,
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('Invalid host protocol')) {
      throw e;
    }
    throw new Error(`@vercel/flags-core: Invalid host "${host}"`);
  }
}

/**
 * Fetches the datafile from the flags service.
 */
export async function fetchDatafile(options: {
  host: string;
  sdkKey: string;
  fetch: typeof globalThis.fetch;
  signal?: AbortSignal;
}): Promise<BundledDefinitions> {
  validateHost(options.host);

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
        Authorization: `Bearer ${options.sdkKey}`,
        'User-Agent': `VercelFlagsCore/${version}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', onExternalAbort);

    if (!res.ok) {
      throw new Error(`Failed to fetch data: ${res.statusText}`);
    }

    // Enforce response body size limit to prevent memory exhaustion
    const contentLength = res.headers.get('content-length');
    if (
      contentLength &&
      Number.parseInt(contentLength, 10) > MAX_RESPONSE_SIZE
    ) {
      throw new Error(
        '@vercel/flags-core: Response body exceeds maximum allowed size',
      );
    }

    return res.json() as Promise<BundledDefinitions>;
  } catch (error) {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', onExternalAbort);
    throw error instanceof Error ? error : new Error('Unknown fetch error');
  }
}
