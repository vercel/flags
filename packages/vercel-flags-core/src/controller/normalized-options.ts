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
const DEFAULT_STALE_WHILE_REVALIDATE_MS = 10_000;

/**
 * Configuration options for Controller
 */
export type ControllerOptions = {
  /** Authentication which resolves the token for requests */
  auth: Auth;

  /**
   * Initial datafile to use immediately
   * - At runtime: used while waiting for stream/poll, then updated in background
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
   * Use request version headers instead of streaming or polling at runtime.
   * Initialization starts no network activity; reads fetch only when needed.
   * Disabling both stream and polling still selects offline mode.
   * @default process.env.VERCEL === '1'
   */
  vercel?: boolean;

  /**
   * How long header-driven reads may serve cached data while refreshing in the
   * background, measured from its last fetch or matching version header.
   * Must be a finite, non-negative number. Set to 0 to always block on refresh.
   * @default 10000
   */
  staleWhileRevalidateMs?: number;

  /**
   * How long runtime reads may use cached data after the first consecutive
   * stream/poll/header failure or stream disconnect. Accepts nonnegative seconds or Infinity.
   * Fractional seconds are supported.
   * Zero disables fallback immediately; positive windows include the deadline.
   * Accepted updates, matching versions, or matching stream primed revisions
   * reset the allowance. Applies to evaluations and getDatafile().
   * Build/offline behavior is unchanged.
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
  vercel: boolean;
  staleWhileRevalidateMs: number;
  staleIfErrorMs: number;
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
  const staleIfError = options.staleIfError ?? Infinity;
  if (typeof staleIfError !== 'number' || !(staleIfError >= 0)) {
    throw new Error(
      '@vercel/flags-core: staleIfError must be a nonnegative number of seconds or Infinity.',
    );
  }

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

  const staleWhileRevalidateMs =
    options.staleWhileRevalidateMs ?? DEFAULT_STALE_WHILE_REVALIDATE_MS;
  if (!Number.isFinite(staleWhileRevalidateMs) || staleWhileRevalidateMs < 0) {
    throw new Error(
      '@vercel/flags-core: staleWhileRevalidateMs must be a finite, non-negative number.',
    );
  }

  return {
    auth: options.auth,
    datafile: options.datafile,
    stream,
    polling,
    vercel: options.vercel ?? process.env.VERCEL === '1',
    staleWhileRevalidateMs,
    staleIfErrorMs: staleIfError * 1000,
    buildStep,
    fetch: options.fetch ?? globalThis.fetch,
    waitUntil: options.waitUntil ?? defaultWaitUntil,
    host: 'https://flags.vercel.com',
    metricEnvironment: options.metricEnvironment,
    clientName: options.clientName,
    disableMetrics: options.disableMetrics ?? false,
  };
}
