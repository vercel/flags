import type { BundledDefinitions } from '../types';
import { readBundledDefinitions } from '../utils/read-bundled-definitions';
import type { DataSource, DataSourceMetadata } from './interface';

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
 * Implements the DataSource interface for Edge Config.
 */
export class FlagNetworkDataSource implements DataSource {
  sdkKey?: string;
  bundledDefinitions: BundledDefinitions | null = null;
  definitions: BundledDefinitions | null = null;
  streamInitPromise: Promise<BundledDefinitions> | null = null;
  _loopPromise: Promise<void> | undefined;
  breakLoop: boolean = false;
  resolveStreamInitPromise: undefined | ((value: BundledDefinitions) => void);
  rejectStreamInitPromise: undefined | ((reason?: any) => void);
  initialized?: boolean = false;
  private hasReceivedData: boolean = false;
  private retryCount: number = 0;
  private readonly maxRetryDelay: number = 30000; // 30 seconds max delay
  private readonly baseRetryDelay: number = 1000; // 1 second initial delay

  readonly host = 'https://flags.vercel.com';

  constructor(options: {
    sdkKey: string;
  }) {
    this.sdkKey = options.sdkKey;

    // preload from embedded json AND set up stream,
    // and only ever read from in-memory data
    this.bundledDefinitions = readBundledDefinitions(this.sdkKey);
  }

  private getRetryDelay(): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
    const delay = Math.min(
      this.baseRetryDelay * Math.pow(2, this.retryCount),
      this.maxRetryDelay,
    );
    return delay;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async subscribe() {
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

    this._loopPromise = this.createLoop().catch((error) => {
      console.error('Failed to create loop', error);
      this.breakLoop = true;
    });

    return this.streamInitPromise;
  }

  async createLoop() {
    while (!this.breakLoop) {
      try {
        console.log(process.pid, 'createLoop → MAKE STREAM');
        const response = await fetch(`${this.host}/v1/stream`, {
          headers: {
            Authorization: `Bearer ${this.sdkKey}`,
          },
        });

        if (!response.ok) {
          const error = new Error(
            `Failed to fetch stream: ${response.statusText}`,
          );
          // Only reject the init promise if we haven't received data yet
          if (!this.hasReceivedData) {
            this.rejectStreamInitPromise!(error);
            throw error;
          }
          // Otherwise, throw to trigger retry
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

        // Reset retry count on successful connection
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
              | { type: 'terminate'; reason: string }
              | { type: 'ping' };

            if (message.type === 'datafile') {
              this.definitions = message.data;
              this.hasReceivedData = true;
              console.log(process.pid, 'loop → data', message.data);
              this.resolveStreamInitPromise!(message.data);
            } else if (message.type === 'terminate') {
              console.log(process.pid, 'loop → terminate:', message.reason);
              this.breakLoop = true;
              break;
            }
          }
        }

        // Stream ended - if not intentional, retry
        if (!this.breakLoop) {
          console.log(process.pid, 'loop → stream closed, will retry');
        }
      } catch (error) {
        // If we haven't received data and this is the initial connection,
        // the error was already propagated via rejectStreamInitPromise
        if (!this.hasReceivedData) {
          throw error;
        }

        console.error(process.pid, 'loop → error, will retry', error);
      }

      // Retry logic with exponential backoff
      if (!this.breakLoop) {
        const delay = this.getRetryDelay();
        this.retryCount++;
        console.log(
          process.pid,
          `loop → retrying in ${delay}ms (attempt ${this.retryCount})`,
        );
        await this.sleep(delay);
      }
    }

    console.log(process.pid, 'loop → done');
  }

  async fetchData(): Promise<BundledDefinitions> {
    const headers = new Headers();
    headers.set('authorization', `Bearer ${this.sdkKey}`);

    const res = await fetch(`${this.host}/v1/datafile`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch data: ${res.statusText}`);
    }

    return (await res.json()) as BundledDefinitions;
  }

  async getMetadata(): Promise<DataSourceMetadata> {
    const data = await this.fetchData();
    return { projectId: data.projectId };
  }

  shutdown(): void {
    this.breakLoop = true;
  }

  // called once per flag rather than once per request,
  // but it's okay since we only ever read from memory here
  async getData() {
    if (!this.initialized) {
      console.log(process.pid, 'getData → init');
      await this.subscribe();
    }
    if (this.streamInitPromise) {
      console.log(process.pid, 'getData → await');
      await this.streamInitPromise;
    }
    if (this.definitions) {
      console.log(process.pid, 'getData → definitions');
      return this.definitions;
    }
    if (this.bundledDefinitions) {
      console.log(process.pid, 'getData → bundledDefinitions');
      return this.bundledDefinitions;
    }
    console.log(process.pid, 'getData → throw');
    throw new Error('No definitions found');
  }
}
