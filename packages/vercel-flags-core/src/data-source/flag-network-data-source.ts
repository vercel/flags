import { version } from '../../package.json';
import type { BundledDefinitions, BundledDefinitionsResult } from '../types';
import { readBundledDefinitions } from '../utils/read-bundled-definitions';
import { sleep } from '../utils/sleep';
import { type TrackReadOptions, UsageTracker } from '../utils/usage-tracker';
import type { DataSource, DataSourceMetadata } from './interface';

type StreamState =
  | 'idle' // Not started yet
  | 'connecting' // Attempting to connect
  | 'connected' // Stream is open and receiving data
  | 'reconnecting' // Stream closed, attempting to reconnect
  | 'failed'; // Permanently failed (e.g., 4xx error), won't retry

const debugLog = (...args: any[]) => {
  if (process.env.DEBUG !== '1') return;
  console.log(...args);
};

async function* streamAsyncIterable(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Implements the DataSource interface for flags.vercel.com.
 */
export class FlagNetworkDataSource implements DataSource {
  sdkKey: string;
  bundledDefinitionsPromise: Promise<BundledDefinitionsResult> | null = null;
  definitions: BundledDefinitions | null = null;
  private streamInitPromise: Promise<BundledDefinitions> | null = null;
  private streamLoopPromise: Promise<void> | undefined;
  private breakLoop: boolean = false;
  private resolveStreamInitPromise:
    | undefined
    | ((value: BundledDefinitions) => void);
  private rejectStreamInitPromise: undefined | ((reason?: any) => void);
  initialized?: boolean = false;
  private hasReceivedData: boolean = false;
  private retryCount: number = 0;
  private readonly maxRetryDelay: number = 30000; // 30 seconds max delay
  private readonly baseRetryDelay: number = 1000; // 1 second initial delay
  private readonly streamInitTimeoutMs: number = 3000; // 3 seconds timeout for initial stream
  private streamState: StreamState = 'idle';
  private hasWarnedAboutStaleData: boolean = false;
  private abortController: AbortController | null = null;
  private usageTracker: UsageTracker;
  private isFirstGetData: boolean = true;
  /** Placeholder for when the config was last updated (to be populated from stream data) */
  configUpdatedAt: number | undefined = undefined;

  readonly host = 'https://flags.vercel.com';

  constructor(options: { sdkKey: string }) {
    if (
      !options.sdkKey ||
      typeof options.sdkKey !== 'string' ||
      !options.sdkKey.startsWith('vf_')
    ) {
      throw new Error(
        '@vercel/flags-core: SDK key must be a string starting with "vf_"',
      );
    }
    this.sdkKey = options.sdkKey;

    this.usageTracker = new UsageTracker({
      sdkKey: options.sdkKey,
      host: this.host,
    });
  }

  /**
   * Lazily loads bundled definitions. Only starts loading when first called,
   * and caches the promise for subsequent calls.
   */
  private async loadBundledDefinitions(): Promise<BundledDefinitionsResult> {
    if (!this.bundledDefinitionsPromise) {
      this.bundledDefinitionsPromise = readBundledDefinitions(this.sdkKey);
    }
    return this.bundledDefinitionsPromise;
  }

  private getRetryDelay(): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
    const delay = Math.min(
      this.baseRetryDelay * 2 ** this.retryCount,
      this.maxRetryDelay,
    );
    return delay;
  }

  private async subscribe() {
    // only init lazily to prevent opening streams when a page
    // has no flags anyhow and just the client is imported
    if (this.initialized) return;
    this.initialized = true;

    const isBuildStep =
      process.env.CI === '1' ||
      process.env.NEXT_PHASE === 'phase-production-build';

    if (isBuildStep) {
      this.initialized = true;
      return;
    }

    this.streamInitPromise = new Promise((resolve, reject) => {
      this.resolveStreamInitPromise = resolve;
      this.rejectStreamInitPromise = reject;
    });

    this.streamLoopPromise = (async () => {
      try {
        await this.consumeStream();
      } catch (error) {
        console.error('Failed to consume stream', error);
        this.breakLoop = true;
      }
    })();

    // Don't return streamInitPromise here - getData() handles the racing logic
  }

  private async consumeStream() {
    while (!this.breakLoop) {
      try {
        // Update state before attempting connection
        this.streamState = this.hasReceivedData ? 'reconnecting' : 'connecting';
        debugLog(`consumeStream → ${this.streamState}`);

        // Create a new AbortController for this connection attempt
        this.abortController = new AbortController();

        const response = await fetch(`${this.host}/v1/stream`, {
          headers: {
            Authorization: `Bearer ${this.sdkKey}`,
            'User-Agent': `VercelFlagsCore/${version}`,
            'X-Retry-Attempt': String(this.retryCount),
          },
          signal: this.abortController.signal,
        });

        if (!response.ok) {
          const error = new Error(
            `Failed to fetch stream: ${response.statusText}`,
          );
          // Stop retrying on 4xx client errors (won't fix itself on retry)
          if (response.status >= 400 && response.status < 500) {
            this.breakLoop = true;
            this.streamState = 'failed';
            if (!this.hasReceivedData) {
              this.rejectStreamInitPromise!(error);
            }
            throw error;
          }
          // Only reject the init promise if we haven't received data yet
          if (!this.hasReceivedData) {
            this.rejectStreamInitPromise!(error);
            throw error;
          }
          // Otherwise, throw to trigger retry (5xx errors, etc.)
          throw error;
        }

        if (!response.body) {
          const error = new Error(`No body found`);
          if (!this.hasReceivedData) {
            this.rejectStreamInitPromise!(error);
            throw error;
          }
          throw error;
        }

        // Successfully connected
        this.streamState = 'connected';
        this.hasWarnedAboutStaleData = false; // Reset warning flag on connect
        this.retryCount = 0;

        const decoder = new TextDecoder();
        let buffer = '';

        for await (const chunk of streamAsyncIterable(response.body)) {
          if (this.breakLoop) break;
          buffer += decoder.decode(chunk, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop()!; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line === '') continue;

            const message = JSON.parse(line) as
              | { type: 'datafile'; data: BundledDefinitions }
              | { type: 'ping' };

            if (message.type === 'datafile') {
              this.definitions = message.data;
              this.hasReceivedData = true;
              debugLog('consumeStream → data', message.data);
              this.resolveStreamInitPromise!(message.data);
            }
          }
        }

        // Stream ended - if not intentional, retry
        if (!this.breakLoop) {
          this.streamState = 'reconnecting';
          debugLog('consumeStream → stream closed, will retry');
        }
      } catch (error) {
        // If we haven't received data and this is the initial connection,
        // the error was already propagated via rejectStreamInitPromise
        if (!this.hasReceivedData) {
          throw error;
        }

        this.streamState = 'reconnecting';
        console.error('consumeStream → error, will retry', error);
      }

      // Retry logic with exponential backoff
      if (!this.breakLoop) {
        const delay = this.getRetryDelay();
        this.retryCount++;
        debugLog(
          `consumeStream → retrying in ${delay}ms (attempt ${this.retryCount})`,
        );
        await sleep(delay);
      }
    }

    debugLog('consumeStream → done');
  }

  async fetchData(): Promise<BundledDefinitions> {
    const res = await fetch(`${this.host}/v1/datafile`, {
      headers: {
        Authorization: `Bearer ${this.sdkKey}`,
        'User-Agent': `VercelFlagsCore/${version}`,
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch data: ${res.statusText}`);
    }

    return (await res.json()) as BundledDefinitions;
  }

  async getMetadata(): Promise<DataSourceMetadata> {
    const data = await this.fetchData();
    return { projectId: data.projectId };
  }

  async shutdown(): Promise<void> {
    this.breakLoop = true;
    this.abortController?.abort();
    await this.usageTracker.flush();
    await this.streamLoopPromise;
  }

  async ensureFallback(): Promise<void> {
    const result = await this.loadBundledDefinitions();

    switch (result.state) {
      case 'ok':
        return;
      case 'missing-file':
        throw new Error(
          'flags: No bundled definitions found. Run "vercel-flags prepare" during your build step.',
        );
      case 'missing-entry':
        throw new Error(
          `flags: No bundled definitions found for SDK key "${this.sdkKey}". Ensure the SDK key is correct and "vercel-flags prepare" was run.`,
        );
      case 'unexpected-error':
        throw new Error(
          `flags: Unexpected error reading bundled definitions: ${String(result.error)}`,
        );
    }
  }

  // called once per flag rather than once per request,
  // but it's okay since we only ever read from memory here
  async getData() {
    const startTime = Date.now();
    const cacheHadDefinitions = this.definitions !== null;
    const isFirstRead = this.isFirstGetData;
    this.isFirstGetData = false;

    if (!this.initialized) {
      debugLog('getData → init');
      await this.subscribe();
    }

    if (this.streamInitPromise) {
      debugLog('getData → await with timeout');

      // Use async wrapper functions to avoid .then()/.catch() deopts
      const waitForStream = async (): Promise<'success' | 'error'> => {
        try {
          await this.streamInitPromise;
          return 'success';
        } catch {
          return 'error';
        }
      };

      const waitForTimeout = async (): Promise<'timeout'> => {
        await sleep(this.streamInitTimeoutMs);
        return 'timeout';
      };

      const result = await Promise.race([waitForStream(), waitForTimeout()]);

      if (result === 'timeout' || result === 'error') {
        debugLog(`getData → ${result}, falling back`);
        // Continue to fallback logic below
        // Note: consumeStream() continues retrying in background
      }
    }

    // Return definitions in priority order
    if (this.definitions) {
      // Warn once if returning in-memory data while stream is not connected
      const isDisconnected = this.streamState !== 'connected';
      if (isDisconnected && !this.hasWarnedAboutStaleData) {
        this.hasWarnedAboutStaleData = true;
        console.warn(
          `[flags] Returning in-memory flag definitions while stream is ${this.streamState}. Data may be stale.`,
        );
      }

      debugLog('getData → definitions');
      const trackOptions: TrackReadOptions = {
        configOrigin: 'in-memory',
        cacheStatus: cacheHadDefinitions ? 'HIT' : 'MISS',
        cacheIsBlocking: !cacheHadDefinitions,
        duration: Date.now() - startTime,
        configUpdatedAt: this.configUpdatedAt,
      };
      if (isFirstRead) {
        trackOptions.cacheIsFirstRead = true;
      }
      this.usageTracker.trackRead(trackOptions);
      return this.definitions;
    }
    const bundledDefinitionsResult = await this.loadBundledDefinitions();
    if (bundledDefinitionsResult.state === 'ok') {
      debugLog('getData → bundledDefinitions');
      // For embedded reads, we omit cacheStatus as per requirements
      const trackOptions: TrackReadOptions = {
        configOrigin: 'embedded',
        cacheIsBlocking: true,
        duration: Date.now() - startTime,
        configUpdatedAt: this.configUpdatedAt,
      };
      if (isFirstRead) {
        trackOptions.cacheIsFirstRead = true;
      }
      this.usageTracker.trackRead(trackOptions);
      return bundledDefinitionsResult.definitions;
    }
    debugLog('getData → throw');
    throw new Error('No definitions found');
  }
}
