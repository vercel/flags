import type { BundledDefinitions } from '../types';
import { readBundledDefinitions } from '../utils/read-bundled-definitions';
import type { DataSource } from './interface';

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

  constructor(options: {
    sdkKey: string;
  }) {
    this.sdkKey = options.sdkKey;

    // preload from embedded json AND set up stream,
    // and only ever read from in-memory data
    this.bundledDefinitions = readBundledDefinitions(this.sdkKey);
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
    console.log(process.pid, 'createLoop → MAKE STREAM');
    const response = await fetch(`https://flags.vercel.com/v1/sse`, {
      headers: {
        Authorization: `Bearer ${this.sdkKey}`,
      },
    });

    if (!response.ok) {
      const error = new Error(`Failed to fetch stream: ${response.statusText}`);
      this.rejectStreamInitPromise!(error);
      throw error;
    }

    if (!response.body) {
      const error = new Error(`No body found`);
      this.rejectStreamInitPromise!(error);
      throw error;
    }

    let buffer = '';

    // Wait for the server to push some data
    for await (const chunk of streamAsyncIterable(response.body)) {
      if (this.breakLoop) break;
      buffer += new TextDecoder().decode(chunk);

      // SSE events are separated by double newlines
      let eventBoundary = buffer.indexOf('\n\n');
      while (eventBoundary !== -1) {
        const eventBlock = buffer.slice(0, eventBoundary);
        buffer = buffer.slice(eventBoundary + 2);

        // Parse the SSE event block
        let eventType: string | null = null;
        let eventData: string | null = null;

        for (const line of eventBlock.split('\n')) {
          // Skip empty lines and comment lines (like ": ping")
          if (line === '' || line.startsWith(':')) continue;

          if (line.startsWith('event: ')) {
            eventType = line.slice(7);
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6);
          }
        }

        // Only process datafile events
        if (eventType === 'datafile' && eventData) {
          const data = JSON.parse(eventData) as BundledDefinitions;
          this.definitions = {
            ...data,
            // TODO: get projectId and environment from the sdk key
            projectId: 'prj_PADdqpFWbMVQijMfVzqcuh8wc9Rq',
            environment: 'development',
          };
          console.log(process.pid, 'loop → data', data);
          this.resolveStreamInitPromise!(data);
        }

        // Check for more events in the buffer
        eventBoundary = buffer.indexOf('\n\n');
      }
    }

    console.log(process.pid, 'loop → done');
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
