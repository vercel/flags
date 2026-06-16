import { getVercelOidcToken } from '@vercel/oidc';
import { version } from '../../package.json';
import type { Auth } from '../controller/auth';
import { getRetryDelayMs } from './backoff';
import type { UsageEvent } from './usage/events';

const MAX_RETRIES = 3;

export const EVALUATING_OIDC_TOKEN_HEADER = 'X-Vercel-Flags-OIDC-Token';

const isDebugMode = process.env.DEBUG?.includes('@vercel/flags-core');

const debugLog = (...args: any[]) => {
  if (!isDebugMode) return;
  console.log(...args);
};

export interface IngestOptions {
  auth: Auth;
  host: string;
  fetch: typeof fetch;
}

async function getEvaluatingOidcToken(auth: Auth): Promise<string | undefined> {
  if (!auth.sdkKey) return undefined;

  try {
    return await getVercelOidcToken();
  } catch {
    return undefined;
  }
}

async function getIngestHeaders(
  options: IngestOptions,
): Promise<Record<string, string>> {
  const token = await options.auth.resolveToken();
  const evaluatingOidcToken = await getEvaluatingOidcToken(options.auth);

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'User-Agent': `VercelFlagsCore/${version}`,
    ...(process.env.VERCEL_ENV
      ? { 'X-Vercel-Env': process.env.VERCEL_ENV }
      : null),
    ...(evaluatingOidcToken
      ? { [EVALUATING_OIDC_TOKEN_HEADER]: evaluatingOidcToken }
      : null),
    ...(isDebugMode ? { 'x-vercel-debug-ingest': '1' } : null),
  };
}

export async function sendIngestEvents(
  options: IngestOptions,
  events: UsageEvent[],
  flushId: number,
): Promise<void> {
  const eventsToSend = events.map((event) => event.ingestEvent());

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await options.fetch(`${options.host}/v1/ingest`, {
        method: 'POST',
        headers: await getIngestHeaders(options),
        body: JSON.stringify(eventsToSend),
      });

      debugLog(
        `@vercel/flags-core: Ingest response ${response.status} for ${eventsToSend.length} events on ${response.headers.get('x-vercel-id')}`,
      );

      if (response.ok) {
        break;
      }

      throw new Error(
        `Ingest endpoint responded with status ${response.status} for ${eventsToSend.length} events on request ${response.headers.get('x-vercel-id')}.\n` +
          `Response body: ${await response.text().catch(() => null)}`,
      );
    } catch (error) {
      console.error(
        `@vercel/flags-core: Error sending events (attempt=${attempt}/${MAX_RETRIES} flushId=${flushId}):`,
        error,
      );
      if (attempt < MAX_RETRIES) {
        const delayMs = getRetryDelayMs(attempt);
        await new Promise((res) => setTimeout(res, delayMs));
      } else {
        // All retries exhausted - surface a structured warning so consumers
        // can alert on dropped batches. The events are not persisted anywhere.
        console.error(
          `@vercel/flags-core: Dropped ${eventsToSend.length} events after ${MAX_RETRIES} attempts (flushId=${flushId})`,
        );
      }
    }
  }
}
