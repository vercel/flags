import { version } from '../../package.json';
import type { BundledDefinitions } from '../types';
import { readBundledDefinitions } from '../utils/read-bundled-definitions';
import { sleep } from '../utils/sleep';
import { UsageTracker } from '../utils/usage-tracker';
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
  sdkKey?: string;
  bundledDefinitions: BundledDefinitions | null = null;
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

  readonly host = 'https://flags.vercel.com';

  constructor(options: { sdkKey: string }) {
    this.sdkKey = options.sdkKey;

    // preload from embedded json AND set up stream,
    // and only ever read from in-memory data
    this.bundledDefinitions = readBundledDefinitions(this.sdkKey);

    this.usageTracker = new UsageTracker({
      sdkKey: options.sdkKey,
      host: this.host,
    });
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
        debugLog(process.pid, `consumeStream → ${this.streamState}`);

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
              debugLog(process.pid, 'consumeStream → data', message.data);
              this.resolveStreamInitPromise!(message.data);
            }
          }
        }

        // Stream ended - if not intentional, retry
        if (!this.breakLoop) {
          this.streamState = 'reconnecting';
          debugLog(process.pid, 'consumeStream → stream closed, will retry');
        }
      } catch (error) {
        // If we haven't received data and this is the initial connection,
        // the error was already propagated via rejectStreamInitPromise
        if (!this.hasReceivedData) {
          throw error;
        }

        this.streamState = 'reconnecting';
        console.error(process.pid, 'consumeStream → error, will retry', error);
      }

      // Retry logic with exponential backoff
      if (!this.breakLoop) {
        const delay = this.getRetryDelay();
        this.retryCount++;
        debugLog(
          process.pid,
          `consumeStream → retrying in ${delay}ms (attempt ${this.retryCount})`,
        );
        await sleep(delay);
      }
    }

    debugLog(process.pid, 'consumeStream → done');
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

  // called once per flag rather than once per request,
  // but it's okay since we only ever read from memory here
  async getData() {
    if (!this.initialized) {
      debugLog(process.pid, 'getData → init');
      await this.subscribe();
    }

    if (this.streamInitPromise) {
      debugLog(process.pid, 'getData → await with timeout');

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
        debugLog(process.pid, `getData → ${result}, falling back`);
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

      debugLog(process.pid, 'getData → definitions');
      this.usageTracker.trackRead();
      return this.definitions;
    }
    if (this.bundledDefinitions) {
      debugLog(process.pid, 'getData → bundledDefinitions');
      this.usageTracker.trackRead();
      return this.bundledDefinitions;
    }
    debugLog(process.pid, 'getData → throw');
    throw new Error('No definitions found');
  }
}
