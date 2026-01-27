import { version } from '../../package.json';
import type { BundledDefinitions, BundledDefinitionsResult } from '../types';
import { readBundledDefinitions } from '../utils/read-bundled-definitions';
import { sleep } from '../utils/sleep';
import { UsageTracker } from '../utils/usage-tracker';
import type { DataSource, DataSourceMetadata } from './interface';

const DEBUG = process.env.DEBUG === '1';
const debugLog = (...args: unknown[]) => {
  if (DEBUG) console.log('[flags]', ...args);
};

/** Schedule a function to run on the next event loop tick (escapes request context) */
const scheduleOutsideRequestContext = (fn: () => void): void => {
  // setImmediate runs after I/O callbacks but before timers, ideal for escaping request context
  if (typeof setImmediate === 'function') {
    setImmediate(fn);
  } else {
    setTimeout(fn, 0);
  }
};

/** Error that should not be retried (e.g., 4xx client errors) */
class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentError';
  }
}

/** Check if an error is an abort error (from any source, not just our signal) */
function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

/** Retry a function with exponential backoff until it succeeds or throws PermanentError */
async function withRetry<T>(
  fn: (signal: AbortSignal, attempt: number) => Promise<T>,
  options: {
    signal: AbortSignal;
    baseDelay?: number;
    maxDelay?: number;
    onRetry?: (attempt: number, error: Error) => void;
  },
): Promise<T> {
  const { signal, baseDelay = 1000, maxDelay = 30000, onRetry } = options;
  let attempt = 0;

  while (!signal.aborted) {
    try {
      return await fn(signal, attempt);
    } catch (error) {
      // Don't retry abort errors (from our signal OR external sources like HMR)
      if (isAbortError(error)) throw error;
      if (signal.aborted) throw error;
      if (error instanceof PermanentError) throw error;

      attempt++;
      const delay = Math.min(baseDelay * 2 ** (attempt - 1), maxDelay);
      onRetry?.(attempt, error as Error);
      await sleep(delay);
    }
  }

  throw new Error('Aborted');
}

/**
 * Implements the DataSource interface for flags.vercel.com.
 */
export class FlagNetworkDataSource implements DataSource {
  readonly host = 'https://flags.vercel.com';
  readonly sdkKey: string;

  definitions: BundledDefinitions | null = null;
  bundledDefinitionsPromise: Promise<BundledDefinitionsResult> | null = null;

  private streamReady: Promise<void>;
  private resolveStreamReady!: () => void;
  private rejectStreamReady!: (error: Error) => void;

  private abortController: AbortController | null = null;
  private streamLoopPromise: Promise<void> | null = null;
  private usageTracker: UsageTracker;

  private initialized = false;
  private connected = false;
  private hasWarnedAboutStaleData = false;

  // Exposed for tests
  breakLoop = false;

  private readonly streamInitTimeoutMs = 3000;

  constructor(options: { sdkKey: string }) {
    const { sdkKey } = options;
    if (!sdkKey?.startsWith('vf_')) {
      throw new Error('@vercel/flags-core: SDK key must start with "vf_"');
    }

    this.sdkKey = sdkKey;
    this.usageTracker = new UsageTracker({ sdkKey, host: this.host });
    this.streamReady = new Promise((resolve, reject) => {
      this.resolveStreamReady = resolve;
      this.rejectStreamReady = reject;
    });
  }

  private subscribe(): void {
    if (this.initialized) return;
    this.initialized = true;

    const isBuildStep =
      process.env.CI === '1' ||
      process.env.NEXT_PHASE === 'phase-production-build';

    if (isBuildStep) return;

    // Schedule stream connection outside the current request context
    // This prevents Next.js from attaching its request lifecycle to our long-running stream
    scheduleOutsideRequestContext(() => {
      debugLog('Starting stream (outside request context)');
      this.streamLoopPromise = this.runStreamLoop();
    });
  }

  private async runStreamLoop(): Promise<void> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      await withRetry(
        async (signal, attempt) => {
          await this.connectAndConsumeStream(signal, attempt);
        },
        {
          signal,
          onRetry: (attempt, error) => {
            this.connected = false;
            console.error('[flags] Stream error, will retry:', error.message);
            debugLog(`Retrying (attempt ${attempt})`);
          },
        },
      );
    } catch (error) {
      if (signal.aborted) {
        // Our own shutdown - don't retry
        debugLog('Stream shutdown');
      } else if (isAbortError(error)) {
        // External abort (HMR, Next.js request lifecycle) - reset to allow restart
        debugLog(
          'Stream aborted externally, will allow restart on next getData()',
        );
        this.initialized = false;
        this.streamReady = new Promise((resolve, reject) => {
          this.resolveStreamReady = resolve;
          this.rejectStreamReady = reject;
        });
      } else {
        // Real error
        console.error('[flags] Stream failed permanently:', error);
        this.rejectStreamReady(error as Error);
      }
    }
  }

  private async connectAndConsumeStream(
    signal: AbortSignal,
    attempt: number,
  ): Promise<never> {
    debugLog('Connecting to stream...');

    // Use cache: 'no-store' to prevent Next.js from caching/managing this request
    // This long-running stream should not be tied to any single request lifecycle
    const response = await fetch(`${this.host}/v1/stream`, {
      headers: {
        Authorization: `Bearer ${this.sdkKey}`,
        'User-Agent': `VercelFlagsCore/${version}`,
        'X-Retry-Attempt': String(attempt),
      },
      signal,
      cache: 'no-store',
      // @ts-expect-error - Next.js specific option to prevent request deduplication
      next: { revalidate: false },
    });

    if (!response.ok) {
      const message = `Stream request failed: ${response.status} ${response.statusText}`;
      // 4xx errors are permanent (auth issues, etc.)
      if (response.status >= 400 && response.status < 500) {
        throw new PermanentError(message);
      }
      throw new Error(message);
    }

    if (!response.body) {
      throw new Error('Stream response has no body');
    }

    debugLog('Connected to stream');
    this.connected = true;
    this.hasWarnedAboutStaleData = false;

    await this.consumeStream(response.body);

    // Stream ended normally - throw to trigger reconnect
    this.connected = false;
    debugLog('Stream ended, will reconnect');
    throw new Error('Stream ended');
  }

  private async consumeStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line) continue;
          this.handleMessage(JSON.parse(line));
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private handleMessage(message: {
    type: string;
    data?: BundledDefinitions;
  }): void {
    if (message.type === 'datafile' && message.data) {
      debugLog('Received datafile for project:', message.data.projectId);
      this.definitions = message.data;
      this.resolveStreamReady();
    }
    // Ignore ping and other message types
  }

  async getData(): Promise<BundledDefinitions> {
    if (!this.initialized) {
      this.subscribe();
    }

    // Wait for stream with timeout
    const timeout = sleep(this.streamInitTimeoutMs).then(
      () => 'timeout' as const,
    );
    const ready = this.streamReady
      .then(() => 'ready' as const)
      .catch(() => 'error' as const);
    const result = await Promise.race([ready, timeout]);

    if (result !== 'ready') {
      debugLog(`Stream ${result}, using fallback`);
    }

    // Return definitions if available
    if (this.definitions) {
      if (!this.connected && !this.hasWarnedAboutStaleData) {
        this.hasWarnedAboutStaleData = true;
        console.warn(
          '[flags] Returning in-memory flag definitions while disconnected. Data may be stale.',
        );
      }
      this.usageTracker.trackRead();
      return this.definitions;
    }

    // Fall back to bundled definitions
    const bundled = await this.loadBundledDefinitions();
    if (bundled.state === 'ok') {
      debugLog('Using bundled definitions');
      this.usageTracker.trackRead();
      return bundled.definitions;
    }

    throw new Error('No flag definitions available');
  }

  private async loadBundledDefinitions(): Promise<BundledDefinitionsResult> {
    if (!this.bundledDefinitionsPromise) {
      this.bundledDefinitionsPromise = readBundledDefinitions(this.sdkKey);
    }
    return this.bundledDefinitionsPromise;
  }

  async fetchData(): Promise<BundledDefinitions> {
    const response = await fetch(`${this.host}/v1/datafile`, {
      headers: {
        Authorization: `Bearer ${this.sdkKey}`,
        'User-Agent': `VercelFlagsCore/${version}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch datafile: ${response.status}`);
    }

    return response.json();
  }

  async getMetadata(): Promise<DataSourceMetadata> {
    const data = await this.fetchData();
    return { projectId: data.projectId };
  }

  async ensureFallback(): Promise<void> {
    const result = await this.loadBundledDefinitions();

    if (result.state === 'ok') return;

    const messages: Record<string, string> = {
      'missing-file':
        'No bundled definitions found. Run "vercel-flags prepare" during your build step.',
      'missing-entry': `No bundled definitions for SDK key "${this.sdkKey}". Check your SDK key and run "vercel-flags prepare".`,
      'unexpected-error': `Error reading bundled definitions: ${result.state === 'unexpected-error' ? result.error : 'unknown'}`,
    };

    throw new Error(`flags: ${messages[result.state]}`);
  }

  async shutdown(): Promise<void> {
    debugLog('Shutting down');
    this.breakLoop = true;
    this.abortController?.abort();
    await this.usageTracker.flush();
    await this.streamLoopPromise;
  }
}
