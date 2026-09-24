import { waitUntil as defaultWaitUntil } from '@vercel/functions';
import type {
  DatafileInput,
  MetricEnvironment,
  PollingOptions,
  StreamOptions,
  WaitUntil,
} from '../types';
import type { Auth } from './auth';

const DEFAULT_STREAM_INIT_TIMEOUT_MS = 3000;
const DEFAULT_POLLING_INTERVAL_MS = 30_000;
const MIN_POLLING_INTERVAL_MS = 30_000;
const DEFAULT_POLLING_INIT_TIMEOUT_MS = 3_000;
const DEFAULT_STALE_WHILE_REVALIDATE = 60;
const DEFAULT_STALE_IF_ERROR = Infinity;

/**
 * Configuration options for Controller
 */
export type ControllerOptions = {
  /** Authentication which resolves the token for requests */
  auth: Auth;

  /**
   * Initial datafile
   * - At runtime: must be confirmed before it has known freshness
   * - At build step: used as primary source (skips network)
   */
  datafile?: DatafileInput;

  /**
   * Configure streaming connection (runtime only, ignored during build step)
   * - `true`: Enable with default options (initTimeoutMs: 3000)
   * - `false`: Disable streaming
   * - `{ initTimeoutMs: number }`: Enable with custom timeout
   * @default true
   */
  stream?: boolean | StreamOptions;

  /**
   * Configure polling fallback (runtime only, ignored during build step)
   * - `true`: Enable with default options (intervalMs: 30000, initTimeoutMs: 3000)
   * - `false`: Disable polling
   * - `{ intervalMs: number, initTimeoutMs: number }`: Enable with custom options
   * @default true
   */
  polling?: boolean | PollingOptions;

  /**
   * How many seconds reads may serve cached data while updates run in the background.
   * Measured from the last poll confirmation, stream disconnection, or (on Vercel)
   * accepted fetch/matching version header. A connected stream remains fresh.
   * Must be a finite, non-negative number. Set to 0 to always block on refresh.
   * @default 60
   */
  staleWhileRevalidate?: number;

  /**
   * How many additional seconds cached data may be served when refreshing fails.
   * Applies to polling, stream reconnection, and header-driven refreshes.
   * Extends staleWhileRevalidate. Infinity allows any available data on error,
   * including unconfirmed bundled/provided data. Finite windows require known freshness.
   * Must be non-negative; Infinity is allowed. 0 adds no extra stale-on-error window.
   * @default Infinity
   */
  staleIfError?: number;

  /**
   * Override build step detection
   * - `true`: Treat as build step (use datafile/bundled only, no network)
   * - `false`: Treat as runtime (try stream/poll first)
   * @default auto-detected via CI=1 or NEXT_PHASE=phase-production-build
   */
  buildStep?: boolean;

  /**
   * Custom fetch function for making HTTP requests.
   * Useful for testing (e.g. resolving to a different IP).
   * @default globalThis.fetch
   */
  fetch?: typeof globalThis.fetch;

  /**
   * Custom function for keeping background work alive after a response has
   * been sent.
   * @default waitUntil from `@vercel/functions`
   */
  waitUntil?: WaitUntil;

  /**
   * Environment included with evaluation metrics sent to the ingest endpoint.
   * Falls back to the `VERCEL_ENV` environment variable when not set.
   * This does not select the environment used for flag evaluation.
   */
  metricEnvironment?: MetricEnvironment;

  /**
   * Custom client name included in evaluation telemetry.
   */
  clientName?: string;

  /**
   * Disable evaluation metrics for this client.
   * @default false
   */
  disableMetrics?: boolean;
};

export type NormalizedOptions = {
  auth: Auth;
  datafile: DatafileInput | undefined;
  stream: { enabled: boolean; initTimeoutMs: number };
  polling: { enabled: boolean; intervalMs: number; initTimeoutMs: number };
  staleWhileRevalidate: number;
  staleIfError: number;
  vercel: boolean;
  buildStep: boolean;
  fetch: typeof globalThis.fetch;
  waitUntil: WaitUntil;
  host: string;
  metricEnvironment: MetricEnvironment | undefined;
  clientName: string | undefined;
  disableMetrics: boolean;
};

export function normalizeOptions(
  options: ControllerOptions,
): NormalizedOptions {
  const autoDetectedBuildStep =
    process.env.CI === '1' ||
    process.env.NEXT_PHASE === 'phase-production-build';
  const buildStep = options.buildStep ?? autoDetectedBuildStep;

  let stream: NormalizedOptions['stream'];
  if (options.stream === undefined || options.stream === true) {
    stream = { enabled: true, initTimeoutMs: DEFAULT_STREAM_INIT_TIMEOUT_MS };
  } else if (options.stream === false) {
    stream = { enabled: false, initTimeoutMs: 0 };
  } else {
    stream = { enabled: true, initTimeoutMs: options.stream.initTimeoutMs };
  }

  let polling: NormalizedOptions['polling'];
  if (options.polling === undefined || options.polling === true) {
    polling = {
      enabled: true,
      intervalMs: DEFAULT_POLLING_INTERVAL_MS,
      initTimeoutMs: DEFAULT_POLLING_INIT_TIMEOUT_MS,
    };
  } else if (options.polling === false) {
    polling = { enabled: false, intervalMs: 0, initTimeoutMs: 0 };
  } else {
    if (options.polling.intervalMs < MIN_POLLING_INTERVAL_MS) {
      throw new Error(
        `@vercel/flags-core: Polling interval must be at least ${MIN_POLLING_INTERVAL_MS}ms, got ${options.polling.intervalMs}ms.`,
      );
    }
    polling = {
      enabled: true,
      intervalMs: options.polling.intervalMs,
      initTimeoutMs: options.polling.initTimeoutMs,
    };
  }

  const staleWhileRevalidate =
    options.staleWhileRevalidate ?? DEFAULT_STALE_WHILE_REVALIDATE;
  if (!Number.isFinite(staleWhileRevalidate) || staleWhileRevalidate < 0) {
    throw new Error(
      '@vercel/flags-core: staleWhileRevalidate must be a finite, non-negative number.',
    );
  }

  const staleIfError = options.staleIfError ?? DEFAULT_STALE_IF_ERROR;
  if (
    staleIfError !== Infinity &&
    (!Number.isFinite(staleIfError) || staleIfError < 0)
  ) {
    throw new Error(
      '@vercel/flags-core: staleIfError must be a non-negative number or Infinity.',
    );
  }

  return {
    auth: options.auth,
    datafile: options.datafile,
    stream,
    polling,
    staleWhileRevalidate,
    staleIfError,
    vercel: process.env.VERCEL === '1',
    buildStep,
    fetch: options.fetch ?? globalThis.fetch,
    waitUntil: options.waitUntil ?? defaultWaitUntil,
    host: 'https://flags.vercel.com',
    metricEnvironment: options.metricEnvironment,
    clientName: options.clientName,
    disableMetrics: options.disableMetrics ?? false,
  };
}
