import type { DatafileInput, PollingOptions, StreamOptions } from '../types';
import type { BundledSource } from './bundled-source';
import type { PollingSource } from './polling-source';
import type { StreamSource } from './stream-source';

const DEFAULT_STREAM_INIT_TIMEOUT_MS = 3000;
const DEFAULT_POLLING_INTERVAL_MS = 30_000;
const MIN_POLLING_INTERVAL_MS = 30_000;
const DEFAULT_POLLING_INIT_TIMEOUT_MS = 3_000;

/**
 * Configuration options for Controller
 */
export type ControllerOptions = {
  /** SDK key for authentication (must start with "vf_") */
  sdkKey: string;

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
};

export type NormalizedOptions = {
  sdkKey: string;
  datafile: DatafileInput | undefined;
  stream: { enabled: boolean; initTimeoutMs: number };
  polling: { enabled: boolean; intervalMs: number; initTimeoutMs: number };
  buildStep: boolean;
  fetch: typeof globalThis.fetch;
  host: string;
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

  return {
    sdkKey: options.sdkKey,
    datafile: options.datafile,
    stream,
    polling,
    buildStep,
    fetch: options.fetch ?? globalThis.fetch,
    host: 'https://flags.vercel.com',
  };
}
